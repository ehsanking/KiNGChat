import { prisma } from '@/lib/prisma';
import { authorizeConversationAccess, canSendToGroup } from '@/lib/conversation-access';
import { appendAuditLog } from '@/lib/audit';
import { incrementMetric } from '@/lib/observability';
import { conversationCacheKey, getOrSetCache, invalidateCacheByPrefix } from '@/lib/cache';
import { canonicalizeDirectConversationId } from '@/lib/conversation-id';

const MAX_EDIT_WINDOW_MS = Number(process.env.MESSAGE_EDIT_WINDOW_MS || 15 * 60 * 1000);
const MAX_SYNC_BATCH = Number(process.env.OFFLINE_SYNC_BATCH || 200);

export const getConversationKey = (userId: string, recipientId?: string | null, groupId?: string | null) => {
  if (groupId) return `group:${groupId}`;
  if (!recipientId) return 'unknown';
  return canonicalizeDirectConversationId(userId, recipientId) ?? 'unknown';
};

const ensureConversationAccess = async (userId: string, recipientId?: string | null, groupId?: string | null) => {
  if (groupId) return canSendToGroup(groupId, userId);
  if (recipientId) return authorizeConversationAccess(recipientId, userId);
  return { allowed: false as const, reason: 'missing_conversation' };
};

export const invalidateConversationCaches = (userId: string, recipientId?: string | null, groupId?: string | null) => {
  const key = getConversationKey(userId, recipientId, groupId);
  invalidateCacheByPrefix(`conversation:${userId}:${key}:`);
  if (recipientId) invalidateCacheByPrefix(`conversation:${recipientId}:${getConversationKey(recipientId, userId, null)}:`);
};

export const getMessageHistoryExtended = async (userId: string, recipientId?: string, groupId?: string, cursor?: string, limit = 50) => {
  const cacheKey = conversationCacheKey(userId, getConversationKey(userId, recipientId, groupId), cursor || 'head');
  return getOrSetCache(cacheKey, async () => {
    const access = await ensureConversationAccess(userId, recipientId, groupId);
    if (!access.allowed) return { error: 'Access denied.' };

    const where: any = { isDeleted: false };
    if (groupId) where.groupId = groupId;
    else if (recipientId) where.OR = [{ senderId: userId, recipientId }, { senderId: recipientId, recipientId: userId }];
    else return { error: 'recipientId or groupId is required.' };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        replyTo: { select: { id: true, senderId: true, ciphertext: true, nonce: true, createdAt: true, isDeleted: true } },
        reactions: { select: { emoji: true, userId: true, createdAt: true } },
      },
    });

    const hasMore = messages.length > Math.min(limit, 100);
    const result = hasMore ? messages.slice(0, Math.min(limit, 100)) : messages;
    return { success: true, messages: result.reverse(), nextCursor: hasMore ? result[0]?.id : null };
  }, { ttlMs: 5_000 });
};

export const syncConversation = async (userId: string, args: { recipientId?: string | null; groupId?: string | null; since?: string | null; limit?: number }) => {
  const access = await ensureConversationAccess(userId, args.recipientId, args.groupId);
  if (!access.allowed) return { error: 'Access denied.' };

  const where: any = { isDeleted: false };
  if (args.groupId) where.groupId = args.groupId;
  else if (args.recipientId) where.OR = [{ senderId: userId, recipientId: args.recipientId }, { senderId: args.recipientId, recipientId: userId }];
  else return { error: 'recipientId or groupId is required.' };

  if (args.since) {
    const since = new Date(args.since);
    if (!Number.isNaN(since.getTime())) {
      where.OR = [
        ...(where.OR || []),
      ];
      where.AND = [{ OR: [{ createdAt: { gt: since } }, { deliveredAt: { gt: since } }, { readAt: { gt: since } }, { editedAt: { gt: since } }] }];
    }
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: Math.min(args.limit || MAX_SYNC_BATCH, MAX_SYNC_BATCH),
    include: { reactions: true, replyTo: { select: { id: true, senderId: true, createdAt: true, ciphertext: true, nonce: true } } },
  });

  incrementMetric('offline_sync_requests', 1, { target: args.groupId ? 'group' : 'direct' });
  return { success: true, messages, syncedAt: new Date().toISOString() };
};

export const markMessagesDelivered = async (userId: string, messageIds: string[]) => {
  const ids = messageIds.filter(Boolean).slice(0, 200);
  if (ids.length === 0) return { success: true, count: 0 };
  const result = await prisma.message.updateMany({ where: { id: { in: ids }, recipientId: userId, deliveredAt: null }, data: { deliveryStatus: 'DELIVERED', deliveredAt: new Date() } as any });
  incrementMetric('message_delivery_updates', result.count);
  return { success: true, count: result.count };
};

export const toggleReaction = async (userId: string, messageId: string, emoji: string) => {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.isDeleted) return { error: 'Message not found.' };
  const access = await ensureConversationAccess(userId, message.recipientId, message.groupId);
  if (!access.allowed) return { error: 'Access denied.' };
  const normalizedEmoji = emoji.trim().slice(0, 16);
  if (!normalizedEmoji) return { error: 'Emoji is required.' };

  const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji: normalizedEmoji } } }).catch(() => null);
  if (existing) {
    await prisma.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId, emoji: normalizedEmoji } } });
    incrementMetric('message_reactions_removed');
    return { success: true, action: 'removed', messageId, emoji: normalizedEmoji };
  }
  await prisma.messageReaction.create({ data: { messageId, userId, emoji: normalizedEmoji } });
  incrementMetric('message_reactions_added');
  return { success: true, action: 'added', messageId, emoji: normalizedEmoji };
};

export const editMessage = async (userId: string, messageId: string, ciphertext: string, nonce: string) => {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.isDeleted) return { error: 'Message not found.' };
  if (message.senderId != userId) return { error: 'Only the sender can edit this message.' };
  if (Date.now() - new Date(message.createdAt).getTime() > MAX_EDIT_WINDOW_MS) return { error: 'Edit window expired.' };
  const updated = await prisma.message.update({ where: { id: messageId }, data: { ciphertext, nonce, editedAt: new Date() } as any, include: { reactions: true, replyTo: true } });
  invalidateConversationCaches(userId, message.recipientId, message.groupId);
  incrementMetric('messages_edited');
  return { success: true, message: updated };
};

export const saveDraft = async (userId: string, args: { recipientId?: string | null; groupId?: string | null; ciphertext?: string | null; nonce?: string | null; clientDraft?: string | null }) => {
  const conversationKey = getConversationKey(userId, args.recipientId, args.groupId);
  if (conversationKey === 'unknown') return { error: 'Conversation is required.' };
  const access = await ensureConversationAccess(userId, args.recipientId, args.groupId);
  if (!access.allowed) return { error: 'Access denied.' };
  const draft = await prisma.messageDraft.upsert({
    where: { userId_conversationKey: { userId, conversationKey } },
    create: { userId, conversationKey, recipientId: args.recipientId || null, groupId: args.groupId || null, ciphertext: args.ciphertext || null, nonce: args.nonce || null, clientDraft: null },
    update: { ciphertext: args.ciphertext || null, nonce: args.nonce || null, clientDraft: null },
  });
  incrementMetric('drafts_saved');
  return { success: true, draft };
};

export const listDrafts = async (userId: string) => {
  const drafts = await prisma.messageDraft.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100 });
  return { success: true, drafts };
};

export const deleteDraft = async (userId: string, recipientId?: string | null, groupId?: string | null) => {
  const conversationKey = getConversationKey(userId, recipientId, groupId);
  await prisma.messageDraft.deleteMany({ where: { userId, conversationKey } });
  incrementMetric('drafts_deleted');
  return { success: true };
};

export const searchMessages = async (userId: string, args: { query: string; recipientId?: string | null; groupId?: string | null; limit?: number }) => {
  const query = args.query.trim();
  if (!query) return { success: true, messages: [], mode: 'metadata_only' as const };
  const access = await ensureConversationAccess(userId, args.recipientId, args.groupId);
  if (!access.allowed) return { error: 'Access denied.' };
  const where: any = { isDeleted: false, OR: [{ fileName: { contains: query, mode: 'insensitive' } }, { id: query }] };
  if (args.groupId) where.groupId = args.groupId;
  else if (args.recipientId) where.AND = [{ OR: [{ senderId: userId, recipientId: args.recipientId }, { senderId: args.recipientId, recipientId: userId }] }];
  const messages = await prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(args.limit || 25, 100), include: { reactions: true, replyTo: true } });
  incrementMetric('message_searches');
  return { success: true, messages, mode: 'metadata_only' as const };
};

export const queueMessageRetry = async (messageId: string, reason?: string | null) => {
  const message = await prisma.message.update({ where: { id: messageId }, data: { retryCount: { increment: 1 }, lastError: reason || 'retry_queued', deliveryStatus: 'QUEUED' } as any });
  incrementMetric('message_retries_queued');
  await appendAuditLog({ action: 'MESSAGE_RETRY_QUEUED', actorUserId: message.senderId, targetId: message.id, conversationId: message.groupId || message.recipientId || undefined, outcome: 'success', details: { reason: reason || null, retryCount: (message as any).retryCount } });
  return { success: true, messageId };
};
