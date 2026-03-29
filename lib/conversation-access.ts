import { prisma } from '@/lib/prisma';
import { normalizeConversationId, parseDirectConversationPeer } from '@/lib/conversation-id';

export type ConversationAccessResult =
  | { allowed: true; kind: 'group'; groupId: string; membershipRole: string; isMuted: boolean }
  | { allowed: true; kind: 'direct'; peerUserId: string }
  | { allowed: false; reason: string; kind?: 'group' | 'direct' | 'unknown' };

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

export async function canSendToGroup(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, isMuted: true },
  }).catch(() => null);

  if (!membership) {
    return { allowed: false as const, reason: 'missing_group_membership' };
  }

  if (membership.isMuted) {
    return { allowed: false as const, reason: 'member_muted' };
  }

  return { allowed: true as const, role: membership.role };
}
