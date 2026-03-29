import { Server } from 'socket.io';
import { logger } from './logger';
import { rateLimit } from './rate-limit';
import { enqueueBackgroundJob } from './task-queue';
import { markUserOnline, markUserOffline } from './presence';
import { getSessionFromCookieHeader } from './session';
import { prisma } from './prisma';
import { parseSendMessageDto } from './dto/messaging';
import type { DeliveryState, SocketMessagePayload } from './contracts/socket';
import { appendAuditLog } from './audit';
import { authorizeConversationAccess, canSendToGroup } from './conversation-access';
import { incrementMetric } from './observability';
import { editMessage, syncConversation, toggleReaction, markMessagesDelivered } from './messaging-service';

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

  io.on('connection', (socket) => {
    const cookieHeader = socket.handshake?.headers?.cookie as string | undefined;
    const session = getSessionFromCookieHeader(cookieHeader, {
      userAgent: socket.handshake?.headers?.['user-agent'] as string | undefined,
      ip: socket.handshake.address,
    });
    if (!session) {
      logger.warn('Socket connection rejected due to missing or invalid session', { socketId: socket.id });
      incrementMetric('socket_connections_rejected', 1, { reason: 'invalid_session' });
      socket.disconnect();
      return;
    }

    socket.data.userId = session.userId;
    socket.join(session.userId);
    markUserOnline(session.userId);
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
      try {
        const membership = await prisma.groupMember.findFirst({ where: { groupId, userId } });
        if (!membership) {
          await appendAuditLog({
            action: 'SOCKET_GROUP_JOIN_REJECTED',
            actorUserId: userId,
            targetId: groupId,
            conversationId: groupId,
            outcome: 'blocked',
            details: { reason: 'missing_group_membership', socketId: socket.id },
          });
          incrementMetric('socket_joins_rejected', 1, { reason: 'missing_group_membership' });
          logger.warn('Socket group join rejected due to missing membership', { userId, groupId });
          return;
        }
      } catch (err) {
        logger.error('Failed to verify group membership', {
          error: err instanceof Error ? err.message : String(err),
          userId,
          groupId,
        });
        return;
      }
      socket.join(`group:${groupId}`);
      incrementMetric('socket_group_joins_allowed');
      logger.info('User joined group room', { userId, groupId });
    });

    socket.on('sendMessage', async (rawData) => {
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
          const groupAccess = await canSendToGroup(data.groupId, senderId);
          if (!groupAccess.allowed) {
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
          const directAccess = await authorizeConversationAccess(data.recipientId, senderId);
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
              deliveryStatus: 'SENT',
            } as any,
          });
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
          wrappedFileKey: (message as any).wrappedFileKey ?? data.wrappedFileKey ?? null,
          wrappedFileKeyNonce: (message as any).wrappedFileKeyNonce ?? data.wrappedFileKeyNonce ?? null,
          fileNonce: (message as any).fileNonce ?? data.fileNonce ?? null,
          createdAt: message.createdAt.toISOString(),
          editedAt: (message as any).editedAt ? new Date((message as any).editedAt).toISOString() : null,
          replyToId: (message as any).replyToId ?? data.replyToId ?? null,
          deliveryStatus: ((message as any).deliveryStatus ?? 'SENT') as DeliveryState,
          readAt: (message as any).readAt ? new Date((message as any).readAt).toISOString() : null,
          tempId: data.tempId,
          idempotencyKey: data.idempotencyKey || null,
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
              } as any,
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

    socket.on('messageRead', async (payload) => {
      const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null;
      if (!messageId) return;
      const readerId = socket.data.userId;
      if (typeof readerId !== 'string') return;

      const message = await prisma.message.findUnique({ where: { id: messageId } }).catch(() => null);
      if (!message) return;
      if (message.recipientId !== readerId && message.senderId !== readerId) return;

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          deliveryStatus: 'READ',
          readAt: new Date(),
        } as any,
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
      const result = await syncConversation(userId, {
        recipientId: typeof payload?.recipientId === 'string' ? payload.recipientId : null,
        groupId: typeof payload?.groupId === 'string' ? payload.groupId : null,
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
      const msg = result.message as any;
      const room = msg.groupId ? `group:${msg.groupId}` : msg.recipientId ? msg.recipientId : userId;
      io.to(room).emit('messageEdited', { id: msg.id, ciphertext: msg.ciphertext, nonce: msg.nonce, editedAt: msg.editedAt?.toISOString?.() || new Date(msg.editedAt).toISOString() });
      io.to(userId).emit('messageEdited', { id: msg.id, ciphertext: msg.ciphertext, nonce: msg.nonce, editedAt: msg.editedAt?.toISOString?.() || new Date(msg.editedAt).toISOString() });
    });

    socket.on('typing', (data) => {
      if (!data || !data.recipientId) return;
      const senderId = socket.data.userId;
      if (typeof senderId !== 'string' || senderId.length === 0) return;
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
      logger.info('Socket disconnected', { socketId: socket.id });
    });
  });
}
