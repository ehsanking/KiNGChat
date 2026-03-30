import { prisma } from '@/lib/prisma';
import { normalizeConversationId, parseDirectConversationPeer } from '@/lib/conversation-id';

export type ConversationAccessResult =
  | { allowed: true; kind: 'group'; groupId: string; membershipRole: string; isMuted: boolean }
  | { allowed: true; kind: 'direct'; peerUserId: string }
  | { allowed: false; reason: string; kind?: 'group' | 'direct' | 'unknown' };

export type ConversationAction =
  | 'conversation.read'
  | 'conversation.join'
  | 'message.send'
  | 'attachment.write';

export type ConversationTarget = {
  conversationId?: string | null;
  groupId?: string | null;
  recipientId?: string | null;
};

const resolveTargetConversationId = (target: ConversationTarget, userId: string) => {
  if (target.groupId) return target.groupId;
  if (target.conversationId) return target.conversationId;
  if (target.recipientId) return normalizeConversationId(target.recipientId, userId) ?? target.recipientId;
  return null;
};

const evaluateConversationAction = (action: ConversationAction, access: ConversationAccessResult) => {
  if (!access.allowed) {
    return { allowed: false as const, reason: access.reason, access };
  }

  if ((action === 'message.send' || action === 'attachment.write') && access.kind === 'group' && access.isMuted) {
    return { allowed: false as const, reason: 'member_muted', access };
  }

  return { allowed: true as const, access };
};

export async function authorizeConversationAccess(
  conversationId: string,
  userId: string,
): Promise<ConversationAccessResult> {
  const normalized = normalizeConversationId(conversationId, userId);
  if (!normalized) return { allowed: false, reason: 'missing_conversation_id', kind: 'unknown' };

  const group = await prisma.group.findUnique({ where: { id: normalized }, select: { id: true } }).catch(() => null);
  if (group) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: normalized, userId } },
      select: { role: true, isMuted: true },
    }).catch(() => null);

    if (!membership) {
      return { allowed: false, reason: 'missing_group_membership', kind: 'group' };
    }

    return {
      allowed: true,
      kind: 'group',
      groupId: normalized,
      membershipRole: membership.role,
      isMuted: membership.isMuted,
    };
  }

  const peerUserId = parseDirectConversationPeer(normalized, userId)
    ?? (normalized === userId ? null : normalized);

  if (!peerUserId) {
    return { allowed: false, reason: 'invalid_direct_conversation', kind: 'direct' };
  }

  const peer = await prisma.user.findUnique({ where: { id: peerUserId }, select: { id: true, isBanned: true } }).catch(() => null);
  if (!peer || peer.isBanned) {
    return { allowed: false, reason: 'invalid_direct_peer', kind: 'direct' };
  }
  return { allowed: true, kind: 'direct', peerUserId };
}

export async function authorizeConversationAction(userId: string, target: ConversationTarget, action: ConversationAction) {
  const conversationId = resolveTargetConversationId(target, userId);
  if (!conversationId) {
    return {
      allowed: false as const,
      reason: 'missing_conversation_id',
      access: { allowed: false as const, reason: 'missing_conversation_id', kind: 'unknown' as const },
    };
  }

  const access = await authorizeConversationAccess(conversationId, userId);
  return evaluateConversationAction(action, access);
}

export async function canSendToGroup(groupId: string, userId: string) {
  const result = await authorizeConversationAction(userId, { groupId }, 'message.send');
  if (!result.allowed) {
    return { allowed: false as const, reason: result.reason };
  }

  if (result.access.kind !== 'group') {
    return { allowed: false as const, reason: 'invalid_group_conversation' };
  }

  return { allowed: true as const, role: result.access.membershipRole };
}
