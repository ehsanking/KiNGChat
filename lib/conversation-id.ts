export const DM_PREFIX = 'dm';

const isUuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

export const canonicalizeDirectConversationId = (userA: string, userB: string) => {
  const a = userA.trim();
  const b = userB.trim();
  if (!a || !b) return null;
  const [left, right] = [a, b].sort((x, y) => x.localeCompare(y));
  return `${DM_PREFIX}:${left}:${right}`;
};

export const normalizeConversationId = (rawConversationId: string, currentUserId?: string) => {
  const normalized = rawConversationId.trim();
  if (!normalized) return null;

  if (normalized.startsWith(`${DM_PREFIX}:`)) {
    const parts = normalized.split(':').slice(1).map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) return null;
    return canonicalizeDirectConversationId(parts[0], parts[1]);
  }

  if (normalized.includes(':')) {
    const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) return canonicalizeDirectConversationId(parts[0], parts[1]);
  }

  if (currentUserId && isUuidLike(normalized)) {
    return canonicalizeDirectConversationId(currentUserId, normalized);
  }

  return normalized;
};

export const parseDirectConversationPeer = (conversationId: string, currentUserId: string) => {
  const canonical = normalizeConversationId(conversationId, currentUserId);
  if (!canonical?.startsWith(`${DM_PREFIX}:`)) return null;
  const [, first, second] = canonical.split(':');
  if (!first || !second) return null;
  if (first !== currentUserId && second !== currentUserId) return null;
  return first === currentUserId ? second : first;
};
