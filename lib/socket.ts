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
import { requireFreshSocketSession } from './fresh-session';
import { normalizeConversationId } from './conversation-id';
import { normalizeTtlSeconds, scheduleMessageExpiry } from './disappearing-messages';

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
    const cookieHeader = socket.handshake?.headers?.cookie as string | undefined;
    const fresh = await requireFreshSocketSession({
      cookieHeader,
      userAgent: socket.handshake?.headers?.['user-agent'] as string | undefined,
      ip: socket.handshake.address,
    });
    if (!fresh) {
      logger.warn('Socket connection rejected due to missing or invalid session', { socketId: socket.id });
      incrementMetric('socket_connections_rejected', 1, { reason: 'invalid_session' });
      socket.disconnect();
      return;
    }
    const { session } = fresh;

    socket.data.userId = session.userId;
    socket.join(session.userId);
    markUserOnline(session.userId);
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
      if (typeof groupId !== 'string' || groupId.length === 0) return;
      const userId = socket.data.userId;
      if (typeof userId !== 'string' || userId.length === 0) return;

      const access = await authorizeConversationAction(userId, { groupId }, 'conversation.join');
      if (!access.allowed || access.access.kind !== 'group') {
        await appendAuditLog({
          action: 'SOCKET_GROUP_JOIN_REJECTED',
          actorUserId: userId,
          targetId: groupId,
          conversationId: groupId,
          outcome: 'blocked',
          details: { reason: access.reason, socketId: socket.id },
        });
        incrementMetric('socket_joins_rejected', 1, { reason: access.reason });
        logger.warn('Socket group join rejected due to missing membership', { userId, groupId, reason: access.reason });
        return;
      }

      socket.join(`group:${groupId}`);
      incrementMetric('socket_group_joins_allowed');
      logger.info('User joined group room', { userId, groupId });
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
      const data = parseSendMessageDto(rawData);
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
      const messageId = typeof payload?.messageId === 'string' ? payload.messageId : '';
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : '';
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
      const messageId = typeof payload?.messageId === 'string' ? payload.messageId : '';
      const ciphertext = typeof payload?.ciphertext === 'string' ? payload.ciphertext : '';
      const nonce = typeof payload?.nonce === 'string' ? payload.nonce : '';
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

    socket.on('typing', async (data) => {
      const senderId = socket.data.userId;
      if (typeof senderId !== 'string' || senderId.length === 0) return;
      const requestedGroupId = typeof data?.groupId === 'string' ? data.groupId : null;
      const requestedRecipientId = typeof data?.recipientId === 'string' ? data.recipientId : null;
      const conversationId = requestedGroupId || (requestedRecipientId ? (normalizeConversationId(requestedRecipientId, senderId) ?? requestedRecipientId) : null);
      if (!conversationId) return;
      const access = await authorizeConversationAction(senderId, { conversationId }, 'conversation.read');
      if (!access.allowed) {
        socket.emit('typingRejected', { reason: access.reason });
        return;
      }
      if (data.groupId) {
        socket.to(`group:${data.groupId}`).emit('userTyping', {
          senderId,
          groupId: data.groupId,
          isTyping: data.isTyping,
        });
      } else {
        io.to(data.recipientId).emit('userTyping', {
          senderId,
          isTyping: data.isTyping,
        });
      }
    });

    socket.on('disconnect', () => {
      if (typeof socket.data.userId === 'string' && socket.data.userId.length > 0) {
        markUserOffline(socket.data.userId);
      }
      activeConnections = Math.max(0, activeConnections - 1);
      setGauge('elahe_active_socket_connections', activeConnections);
      logger.info('Socket disconnected', { socketId: socket.id });
    });
  });
}
