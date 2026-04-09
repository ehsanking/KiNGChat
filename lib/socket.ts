import { Server } from 'socket.io';
import { logger } from './logger';
import { rateLimit } from './rate-limit';
import { enqueueBackgroundJob } from './task-queue';
import { markUserOnline, markUserOffline } from './presence';
import { prisma } from './prisma';
import { parseSendMessageDto } from './dto/messaging';
import type { DeliveryState, SocketMessagePayload } from './contracts/socket';
import { appendAuditLog } from './audit';
import { authorizeConversationAction } from './conversation-access';
import { incrementMetric, setGauge } from './observability';
import { traceSocketOperation } from './otel';
import { editMessage, syncConversation, toggleReaction, markMessagesDelivered } from './messaging-service';
import { normalizeConversationId } from './conversation-id';
import { normalizeTtlSeconds, scheduleMessageExpiry } from './disappearing-messages';
import { validateBody } from './validation/middleware';
import { routeBotCommand } from './bot/bot-manager';
import { postToBotWebhook } from './bot/bot-api';
import { editMessageSchema, reactionSchema, sendMessageSchema, typingSchema } from './validation/messaging';

export type SocketOptions = {
  socketRateLimitWindowMs: number;
  socketRateLimitMax: number;
};

const emitDeliveryUpdate = (
  io: Server,
  room: string,
  payload: { id: string; deliveryStatus: DeliveryState; deliveredAt?: string | null; readAt?: string | null },
) => {
  io.to(room).emit('messageStatus', payload);
};

export function setupSocket(io: Server, options: SocketOptions) {
  const { socketRateLimitWindowMs, socketRateLimitMax } = options;
  let activeConnections = 0;

  io.on('connection', async (socket) => {
    const session = socket.data.session as { userId?: string } | undefined;
    if (!session?.userId) {
      logger.warn('Socket connection missing authenticated session', { socketId: socket.id });
      incrementMetric('socket_connections_rejected', 1, { reason: 'invalid_session' });
      socket.disconnect();
      return;
    }

    socket.data.userId = session.userId;
    socket.join(session.userId);
    void markUserOnline(session.userId);
    io.emit('presence:online', { userId: session.userId, at: new Date().toISOString() });
    activeConnections += 1;
    setGauge('elahe_active_socket_connections', activeConnections);
    logger.info('Socket connection established', { socketId: socket.id, userId: session.userId });
    incrementMetric('socket_connections_accepted');

    socket.on('join', (userId) => {
      if (typeof userId !== 'string' || userId !== session.userId) {
        logger.warn('Socket join rejected due to mismatched userId', {
          socketId: socket.id,
          providedUserId: userId,
          sessionUserId: session.userId,
        });
        incrementMetric('socket_joins_rejected', 1, { reason: 'mismatched_user' });
      }
    });

    socket.on('joinGroup', async (groupId) => {
      const joinInput = validateBody(typingSchema.pick({ groupId: true }), { groupId });
      if (!joinInput.success || !joinInput.data.groupId) return;
      const parsedGroupId = joinInput.data.groupId;
      const userId = socket.data.userId;
      if (typeof userId !== 'string' || userId.length === 0) return;

      const access = await authorizeConversationAction(userId, { groupId: parsedGroupId }, 'conversation.join');
      if (!access.allowed || access.access.kind !== 'group') {
        await appendAuditLog({
          action: 'SOCKET_GROUP_JOIN_REJECTED',
          actorUserId: userId,
          targetId: parsedGroupId,
          conversationId: parsedGroupId,
          outcome: 'blocked',
          details: { reason: access.reason, socketId: socket.id },
        });
        incrementMetric('socket_joins_rejected', 1, { reason: access.reason });
        logger.warn('Socket group join rejected due to missing membership', { userId, groupId: parsedGroupId, reason: access.reason });
        return;
      }

      socket.join(`group:${parsedGroupId}`);
      incrementMetric('socket_group_joins_allowed');
      logger.info('User joined group room', { userId, groupId: parsedGroupId });
    });

    socket.on('groupKeyRotated', async (payload: { groupId?: string; keyGeneration?: number } | undefined) => {
      const userId = socket.data.userId;
      const groupId = typeof payload?.groupId === 'string' ? payload.groupId.trim() : '';
      const keyGeneration = typeof payload?.keyGeneration === 'number' ? payload.keyGeneration : null;
      if (!userId || !groupId) return;
      const access = await authorizeConversationAction(userId, { groupId }, 'message.send');
      if (!access.allowed) return;
      socket.to(`group:${groupId}`).emit('groupKeyRotated', { groupId, keyGeneration });
    });

    socket.on('senderKeyDistributed', async (payload: { groupId?: string; [key: string]: unknown } | undefined) => {
      const userId = socket.data.userId;
      const groupId = typeof payload?.groupId === 'string' ? payload.groupId.trim() : '';
      if (!userId || !groupId) return;
      const access = await authorizeConversationAction(userId, { groupId }, 'message.send');
      if (!access.allowed) return;
      socket.to(`group:${groupId}`).emit('senderKeyDistributed', payload);
    });

    socket.on('sendMessage', async (rawData) => {
      await traceSocketOperation('socket.send_message', { socketId: socket.id }, async () => {
      const validation = validateBody(sendMessageSchema, rawData);
      if (!validation.success) {
        socket.emit('messageRejected', { reason: 'validation_error', errorCode: 'VALIDATION_ERROR', details: validation.details });
        return;
      }
      const data = parseSendMessageDto(validation.data);
      if (!data) {
        logger.warn('Invalid message payload received', { socketId: socket.id });
        incrementMetric('socket_messages_rejected', 1, { reason: 'invalid_payload' });
        socket.emit('messageRejected', { reason: 'invalid_payload' });
        return;
      }

      const senderId = socket.data.userId;
      if (typeof senderId !== 'string' || senderId.length === 0) {
        logger.warn('No authenticated sender for message', { socketId: socket.id });
        incrementMetric('socket_messages_rejected', 1, { reason: 'unauthenticated_sender' });
        socket.emit('messageRejected', { reason: 'unauthenticated_sender' });
        return;
      }

      const ip = socket.handshake.address || 'unknown';
      const rateResult = await rateLimit(`socket:${senderId}:${ip}`, {
        windowMs: socketRateLimitWindowMs,
        max: socketRateLimitMax,
      });
      if (!rateResult.allowed) {
        logger.warn('Socket message rate limit exceeded', { socketId: socket.id, senderId, ip });
        incrementMetric('socket_messages_rejected', 1, { reason: 'rate_limited' });
        socket.emit('messageRejected', { reason: 'rate_limited', resetAt: rateResult.resetAt });
        return;
      }

      try {
        const sender = await prisma.user.findUnique({
          where: { id: senderId },
          select: { identityKeyPublic: true, signedPreKey: true, signedPreKeySig: true },
        });
        const senderEnrolled = Boolean(
          sender?.identityKeyPublic?.trim() && sender?.signedPreKey?.trim() && sender?.signedPreKeySig?.trim(),
        );
        if (!senderEnrolled) {
          socket.emit('messageRejected', { reason: 'e2ee_not_enrolled' });
          incrementMetric('socket_messages_rejected', 1, { reason: 'e2ee_not_enrolled' });
          await appendAuditLog({
            action: 'SOCKET_SEND_REJECTED',
            actorUserId: senderId,
            ip,
            outcome: 'blocked',
            details: { reason: 'e2ee_not_enrolled', socketId: socket.id },
          });
          return;
        }

        let message = data.idempotencyKey
          ? await prisma.message.findFirst({ where: { senderId, idempotencyKey: data.idempotencyKey } })
          : null;

        if (data.groupId) {
          const groupAccess = await authorizeConversationAction(senderId, { groupId: data.groupId }, 'message.send');
          if (!groupAccess.allowed || groupAccess.access.kind !== 'group') {
            await appendAuditLog({
              action: 'SOCKET_SEND_REJECTED',
              actorUserId: senderId,
              targetId: data.groupId,
              conversationId: data.groupId,
              ip,
              outcome: 'blocked',
              details: { reason: groupAccess.reason, socketId: socket.id },
            });
            incrementMetric('socket_messages_rejected', 1, { reason: groupAccess.reason });
            logger.warn('Socket group message rejected', { senderId, groupId: data.groupId, reason: groupAccess.reason });
            socket.emit('messageRejected', { reason: groupAccess.reason, groupId: data.groupId });
            return;
          }
        }

        if (data.recipientId) {
          const directAccess = await authorizeConversationAction(senderId, { recipientId: data.recipientId }, 'message.send');
          if (!directAccess.allowed) {
            await appendAuditLog({
              action: 'SOCKET_SEND_REJECTED',
              actorUserId: senderId,
              targetId: data.recipientId,
              conversationId: data.recipientId,
              ip,
              outcome: 'blocked',
              details: { reason: directAccess.reason, socketId: socket.id },
            });
            incrementMetric('socket_messages_rejected', 1, { reason: directAccess.reason });
            socket.emit('messageRejected', { reason: directAccess.reason, recipientId: data.recipientId });
            return;
          }
        }

        if (!message && !data.nonce && data.ciphertext.trim().startsWith('/')) {
          const conversationId = data.groupId || data.recipientId || '';
          const routed = await routeBotCommand({
            commandText: data.ciphertext,
            conversationId,
            senderId,
          });
          if (routed?.bot?.webhookUrl) {
            await postToBotWebhook(routed.bot.webhookUrl, {
              event: 'command',
              payload: {
                botId: routed.bot.id,
                command: routed.command,
                args: routed.args,
                senderId,
                conversationId,
              },
            }).catch(() => undefined);
          }
        }

        if (!message) {
          message = await prisma.message.create({
            data: {
              senderId,
              recipientId: data.recipientId || null,
              groupId: data.groupId || null,
              type: data.type,
              ciphertext: data.ciphertext,
              nonce: data.nonce,
              fileUrl: data.fileUrl || null,
              fileName: data.fileName || null,
              fileSize: data.fileSize || null,
              wrappedFileKey: data.wrappedFileKey || null,
              wrappedFileKeyNonce: data.wrappedFileKeyNonce || null,
              fileNonce: data.fileNonce || null,
              idempotencyKey: data.idempotencyKey || null,
              replyToId: data.replyToId || null,
              forwardedFrom: data.forwardedFrom || null,
              ttlSeconds: normalizeTtlSeconds(data.ttlSeconds),
              expiresAt: normalizeTtlSeconds(data.ttlSeconds)
                ? new Date(Date.now() + Number(normalizeTtlSeconds(data.ttlSeconds)) * 1000)
                : null,
              audioDuration: typeof data.audioDuration === 'number' ? data.audioDuration : null,
              waveformData: typeof data.waveformData === 'string' ? data.waveformData : null,
              deliveryStatus: 'SENT',
            },
          });

          if (normalizeTtlSeconds(data.ttlSeconds)) {
            message = await scheduleMessageExpiry(message.id, data.ttlSeconds);
          }
        }

        const messageData: SocketMessagePayload = {
          id: message.id,
          senderId,
          recipientId: data.recipientId || null,
          groupId: data.groupId || null,
          type: data.type,
          ciphertext: data.ciphertext,
          nonce: data.nonce,
          fileUrl: data.fileUrl || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          wrappedFileKey: message.wrappedFileKey ?? data.wrappedFileKey ?? null,
          wrappedFileKeyNonce: message.wrappedFileKeyNonce ?? data.wrappedFileKeyNonce ?? null,
          fileNonce: message.fileNonce ?? data.fileNonce ?? null,
          createdAt: message.createdAt.toISOString(),
          editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null,
          replyToId: message.replyToId ?? data.replyToId ?? null,
          forwardedFrom: message.forwardedFrom ?? data.forwardedFrom ?? null,
          deliveryStatus: (message.deliveryStatus ?? 'SENT') as DeliveryState,
          readAt: message.readAt ? new Date(message.readAt).toISOString() : null,
          tempId: data.tempId,
          idempotencyKey: data.idempotencyKey || null,
          keyGeneration: data.keyGeneration ?? null,
          messageIndex: data.messageIndex ?? null,
          ttlSeconds: message.ttlSeconds ?? data.ttlSeconds ?? null,
          expiresAt: message.expiresAt ? new Date(message.expiresAt).toISOString() : null,
          audioDuration: message.audioDuration ?? data.audioDuration ?? null,
          waveformData: message.waveformData ?? data.waveformData ?? null,
        };

        if (data.groupId) {
          socket.to(`group:${data.groupId}`).emit('receiveMessage', messageData);
          socket.emit('receiveMessage', { ...messageData, _self: true });
        } else if (data.recipientId) {
          io.to(data.recipientId).emit('receiveMessage', messageData);
          if (data.recipientId !== senderId) {
            socket.emit('messageSent', { id: message.id, tempId: data.tempId, idempotencyKey: data.idempotencyKey });
          }
        }

        if (message.replyToId) {
          const threadPayload = {
            rootMessageId: message.replyToId,
            replyId: message.id,
            senderId,
            recipientId: data.recipientId || null,
            groupId: data.groupId || null,
            createdAt: message.createdAt.toISOString(),
          };
          if (data.groupId) {
            io.to(`group:${data.groupId}`).emit('thread:updated', threadPayload);
          } else if (data.recipientId) {
            io.to(data.recipientId).emit('thread:updated', threadPayload);
            io.to(senderId).emit('thread:updated', threadPayload);
          }
        }

        incrementMetric('socket_messages_persisted', 1, {
          target: data.groupId ? 'group' : 'direct',
        });
        incrementMetric('elahe_messages_sent_total');

        if (data.recipientId) {
          try {
            await enqueueBackgroundJob({
              name: 'push_notification',
              payload: {
                recipientId: data.recipientId,
                title: 'New Message',
                body: 'You have received a new encrypted message.',
                url: '/chat',
              },
            });
          } catch (err) {
            incrementMetric('socket_push_enqueue_failed');
            logger.error('Failed to enqueue push notification', {
              error: err instanceof Error ? err.message : String(err),
            });
            await prisma.message.update({
              where: { id: message.id },
              data: {
                retryCount: { increment: 1 },
                lastError: err instanceof Error ? err.message : String(err),
                deliveryStatus: 'FAILED',
              },
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        logger.error('Failed to persist message', {
          error: err instanceof Error ? err.message : String(err),
          senderId,
          recipientId: data.recipientId ?? null,
          groupId: data.groupId ?? null,
        });
        await appendAuditLog({
          action: 'SOCKET_MESSAGE_PERSIST_FAILED',
          actorUserId: senderId,
          targetId: data.groupId ?? data.recipientId ?? null,
          conversationId: data.groupId ?? data.recipientId ?? null,
          ip,
          outcome: 'failure',
          details: {
            tempId: data.tempId ?? null,
            idempotencyKey: data.idempotencyKey ?? null,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        incrementMetric('socket_messages_rejected', 1, { reason: 'persist_failed' });
        socket.emit('messageRejected', {
          reason: 'persist_failed',
          tempId: data.tempId ?? null,
          idempotencyKey: data.idempotencyKey ?? null,
        });
      }
      });
    });


    socket.on('message:forward', async (payload) => {
      const senderId = socket.data.userId;
      if (typeof senderId !== 'string') return;
      const sourceMessageId = typeof payload?.messageId === 'string' ? payload.messageId.trim() : '';
      const recipientId = typeof payload?.recipientId === 'string' ? payload.recipientId.trim() : null;
      const groupId = typeof payload?.groupId === 'string' ? payload.groupId.trim() : null;
      if (!sourceMessageId || (!recipientId && !groupId)) {
        socket.emit('messageForwardRejected', { reason: 'validation_error' });
        return;
      }
      const source = await prisma.message.findUnique({ where: { id: sourceMessageId } });
      if (!source || source.isDeleted) {
        socket.emit('messageForwardRejected', { reason: 'message_not_found' });
        return;
      }
      const sourceAccess = await authorizeConversationAction(senderId, { recipientId: source.recipientId, groupId: source.groupId }, 'conversation.read');
      if (!sourceAccess.allowed) {
        socket.emit('messageForwardRejected', { reason: 'access_denied' });
        return;
      }
      const targetAccess = await authorizeConversationAction(senderId, { recipientId, groupId }, 'message.send');
      if (!targetAccess.allowed) {
        socket.emit('messageForwardRejected', { reason: targetAccess.reason });
        return;
      }
      const sender = await prisma.user.findUnique({ where: { id: source.senderId }, select: { displayName: true, username: true } });
      const forwardedFrom = sender?.displayName?.trim() || sender?.username || 'Unknown';
      const forwarded = await prisma.message.create({
        data: {
          senderId,
          recipientId,
          groupId,
          type: source.type,
          ciphertext: source.ciphertext,
          nonce: source.nonce,
          fileUrl: source.fileUrl,
          fileName: source.fileName,
          fileSize: source.fileSize,
          wrappedFileKey: source.wrappedFileKey,
          wrappedFileKeyNonce: source.wrappedFileKeyNonce,
          fileNonce: source.fileNonce,
          audioDuration: source.audioDuration,
          waveformData: source.waveformData,
          deliveryStatus: 'SENT',
          forwardedFrom,
        },
      });
      const forwardPayload: SocketMessagePayload = {
        id: forwarded.id,
        senderId,
        recipientId,
        groupId,
        type: forwarded.type,
        ciphertext: forwarded.ciphertext,
        nonce: forwarded.nonce,
        fileUrl: forwarded.fileUrl,
        fileName: forwarded.fileName,
        fileSize: forwarded.fileSize,
        wrappedFileKey: forwarded.wrappedFileKey,
        wrappedFileKeyNonce: forwarded.wrappedFileKeyNonce,
        fileNonce: forwarded.fileNonce,
        createdAt: forwarded.createdAt.toISOString(),
        deliveryStatus: 'SENT',
        forwardedFrom,
      };
      if (groupId) {
        io.to(`group:${groupId}`).emit('receiveMessage', forwardPayload);
      } else if (recipientId) {
        io.to(recipientId).emit('receiveMessage', forwardPayload);
        io.to(senderId).emit('receiveMessage', { ...forwardPayload, _self: true });
      }
      socket.emit('message:forwarded', { sourceMessageId, forwardedMessageId: forwarded.id });
    });

    socket.on('call:initiate', async (payload) => {
      const fromUserId = socket.data.userId;
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId.trim() : '';
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      const type = payload?.type === 'video' ? 'video' : 'voice';
      if (typeof fromUserId !== 'string' || !toUserId || !callId || fromUserId === toUserId) return;
      const access = await authorizeConversationAction(fromUserId, { recipientId: toUserId }, 'conversation.read');
      if (!access.allowed) {
        socket.emit('call:rejected', { callId, reason: access.reason });
        return;
      }
      await prisma.callLog.create({ data: { id: callId, callerId: fromUserId, recipientId: toUserId, type, status: 'ringing' } }).catch(() => undefined);
      io.to(toUserId).emit('call:ring', { callId, fromUserId, toUserId, type });
    });

    socket.on('call:accept', async (payload) => {
      const toUserId = socket.data.userId;
      const fromUserId = typeof payload?.fromUserId === 'string' ? payload.fromUserId.trim() : '';
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      const type = payload?.type === 'video' ? 'video' : 'voice';
      if (typeof toUserId !== 'string' || !fromUserId || !callId) return;
      await prisma.callLog.updateMany({ where: { id: callId }, data: { status: 'connected', startedAt: new Date() } }).catch(() => undefined);
      io.to(fromUserId).emit('call:accept', { callId, fromUserId, toUserId, type });
    });

    socket.on('call:reject', async (payload) => {
      const toUserId = socket.data.userId;
      const fromUserId = typeof payload?.fromUserId === 'string' ? payload.fromUserId.trim() : '';
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      const type = payload?.type === 'video' ? 'video' : 'voice';
      if (typeof toUserId !== 'string' || !fromUserId || !callId) return;
      await prisma.callLog.updateMany({ where: { id: callId }, data: { status: 'rejected', endedAt: new Date() } }).catch(() => undefined);
      io.to(fromUserId).emit('call:reject', { callId, fromUserId, toUserId, type });
    });

    socket.on('call:offer', (payload) => {
      const fromUserId = socket.data.userId;
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId.trim() : '';
      if (typeof fromUserId !== 'string' || !toUserId) return;
      io.to(toUserId).emit('call:offer', { ...payload, fromUserId });
    });

    socket.on('call:answer', (payload) => {
      const fromUserId = socket.data.userId;
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId.trim() : '';
      if (typeof fromUserId !== 'string' || !toUserId) return;
      io.to(toUserId).emit('call:answer', { ...payload, fromUserId });
    });

    socket.on('call:ice-candidate', (payload) => {
      const fromUserId = socket.data.userId;
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId.trim() : '';
      if (typeof fromUserId !== 'string' || !toUserId) return;
      io.to(toUserId).emit('call:ice-candidate', { ...payload, fromUserId });
    });

    socket.on('call:end', async (payload) => {
      const fromUserId = socket.data.userId;
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId.trim() : '';
      const callId = typeof payload?.callId === 'string' ? payload.callId.trim() : '';
      if (typeof fromUserId !== 'string' || !toUserId || !callId) return;
      const endedAt = new Date();
      const existing = await prisma.callLog.findUnique({ where: { id: callId } }).catch(() => null);
      const duration = existing?.startedAt ? Math.max(0, Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000)) : null;
      await prisma.callLog.updateMany({ where: { id: callId }, data: { status: 'ended', endedAt, duration } }).catch(() => undefined);
      io.to(toUserId).emit('call:end', { callId, fromUserId, toUserId });
    });

    socket.on('messageRead', async (payload) => {
      const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null;
      if (!messageId) return;
      const readerId = socket.data.userId;
      if (typeof readerId !== 'string') return;

      const message = await prisma.message.findUnique({ where: { id: messageId } }).catch(() => null);
      if (!message) return;
      if (message.groupId) {
        socket.emit('messageReadRejected', { reason: 'group_read_receipts_disabled' });
        return;
      }
      if (message.recipientId !== readerId) return;

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          deliveryStatus: 'READ',
          readAt: new Date(),
        },
      }).catch(() => null);
      if (!updated) return;

      emitDeliveryUpdate(io, message.senderId, {
        id: messageId,
        deliveryStatus: 'READ',
        readAt: updated.readAt ? updated.readAt.toISOString() : new Date().toISOString(),
      });
    });

    socket.on('messagesDelivered', async (payload) => {
      const ids = Array.isArray(payload?.messageIds) ? payload.messageIds.filter((value: unknown): value is string => typeof value === 'string') : [];
      const userId = socket.data.userId;
      if (typeof userId !== 'string' || ids.length === 0) return;
      const result = await markMessagesDelivered(userId, ids);
      if (result.success) {
        incrementMetric('socket_delivery_acks', result.count || 0);
      }
    });

    socket.on('syncConversation', async (payload) => {
      const userId = socket.data.userId;
      if (typeof userId !== 'string') return;
      const requestedGroupId = typeof payload?.groupId === 'string' ? payload.groupId : null;
      const requestedRecipientId = typeof payload?.recipientId === 'string' ? payload.recipientId : null;
      const conversationId = requestedGroupId || (requestedRecipientId ? (normalizeConversationId(requestedRecipientId, userId) ?? requestedRecipientId) : null);
      if (conversationId) {
        const access = await authorizeConversationAction(userId, { conversationId }, 'conversation.read');
        if (!access.allowed) {
          socket.emit('conversationSync', { error: 'Access denied.' });
          return;
        }
      }
      const result = await syncConversation(userId, {
        recipientId: requestedRecipientId,
        groupId: requestedGroupId,
        since: typeof payload?.since === 'string' ? payload.since : null,
        limit: typeof payload?.limit === 'number' ? payload.limit : 200,
      });
      socket.emit('conversationSync', result);
    });

    socket.on('toggleReaction', async (payload) => {
      const userId = socket.data.userId;
      if (typeof userId !== 'string') return;
      const validation = validateBody(reactionSchema, payload);
      if (!validation.success) {
        socket.emit('messageReactionRejected', { error: 'Request validation failed.', errorCode: 'VALIDATION_ERROR', details: validation.details });
        return;
      }
      const { messageId, emoji } = validation.data;
      const result = await toggleReaction(userId, messageId, emoji);
      if (!('success' in result) || !result.success) {
        socket.emit('messageReactionRejected', result);
        return;
      }
      const message = await prisma.message.findUnique({ where: { id: messageId } }).catch(() => null);
      const room = message?.groupId ? `group:${message.groupId}` : message?.recipientId ? message.recipientId : userId;
      io.to(room).emit('messageReactionUpdated', { messageId, emoji, action: result.action, userId });
      io.to(userId).emit('messageReactionUpdated', { messageId, emoji, action: result.action, userId });
    });

    socket.on('editMessage', async (payload) => {
      const userId = socket.data.userId;
      if (typeof userId !== 'string') return;
      const validation = validateBody(editMessageSchema, payload);
      if (!validation.success) {
        socket.emit('messageEditRejected', { error: 'Request validation failed.', errorCode: 'VALIDATION_ERROR', details: validation.details });
        return;
      }
      const { messageId, ciphertext, nonce } = validation.data;
      const result = await editMessage(userId, messageId, ciphertext, nonce);
      if (!('success' in result) || !result.success) {
        socket.emit('messageEditRejected', result);
        return;
      }
      const msg = result.message;
      const editedAtStr = msg.editedAt ? new Date(msg.editedAt).toISOString() : new Date().toISOString();
      const room = msg.groupId ? `group:${msg.groupId}` : msg.recipientId ? msg.recipientId : userId;
      io.to(room).emit('messageEdited', { id: msg.id, ciphertext: msg.ciphertext, nonce: msg.nonce, editedAt: editedAtStr });
      io.to(userId).emit('messageEdited', { id: msg.id, ciphertext: msg.ciphertext, nonce: msg.nonce, editedAt: editedAtStr });
    });

    const handleTyping = async (data: unknown) => {
      const senderId = socket.data.userId;
      if (typeof senderId !== 'string' || senderId.length === 0) return;
      const validation = validateBody(typingSchema, data);
      if (!validation.success) {
        socket.emit('typingRejected', { error: 'Request validation failed.', errorCode: 'VALIDATION_ERROR', details: validation.details });
        return;
      }
      const requestedGroupId = validation.data.groupId ?? null;
      const requestedRecipientId = validation.data.recipientId ?? null;
      const conversationId = requestedGroupId || (requestedRecipientId ? (normalizeConversationId(requestedRecipientId, senderId) ?? requestedRecipientId) : null);
      if (!conversationId) return;
      const access = await authorizeConversationAction(senderId, { conversationId }, 'conversation.read');
      if (!access.allowed) {
        socket.emit('typingRejected', { reason: access.reason });
        return;
      }
      if (validation.data.groupId) {
        io.to(`group:${validation.data.groupId}`).emit('presence:typing', {
          senderId,
          groupId: validation.data.groupId,
          isTyping: validation.data.isTyping,
        });
        socket.to(`group:${validation.data.groupId}`).emit('userTyping', {
          senderId,
          groupId: validation.data.groupId,
          isTyping: validation.data.isTyping,
        });
      } else {
        if (!validation.data.recipientId) return;
        io.to(validation.data.recipientId).emit('userTyping', {
          senderId,
          isTyping: validation.data.isTyping,
        });
        io.to(validation.data.recipientId).emit('presence:typing', {
          senderId,
          isTyping: validation.data.isTyping,
        });
      }
    };

    socket.on('typing', handleTyping);
    socket.on('presence:typing', handleTyping);

    socket.on('disconnect', () => {
      if (typeof socket.data.userId === 'string' && socket.data.userId.length > 0) {
        void markUserOffline(socket.data.userId);
        io.emit('presence:offline', { userId: socket.data.userId, at: new Date().toISOString() });
        io.emit('presence:lastSeen', { userId: socket.data.userId, at: new Date().toISOString() });
      }
      activeConnections = Math.max(0, activeConnections - 1);
      setGauge('elahe_active_socket_connections', activeConnections);
      logger.info('Socket disconnected', { socketId: socket.id });
    });
  });
}
