import crypto from 'crypto';

type ChallengeRecord = {
  id: string;
  userId: string;
  expiresAt: number;
  userAgentHash: string | null;
  ipHash: string | null;
};

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const store = new Map<string, ChallengeRecord>();

const hashOptional = (value: string | null | undefined) =>
  value ? crypto.createHash('sha256').update(value).digest('hex') : null;

const cleanupExpired = () => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) store.delete(key);
  }
};

export const createPreAuthChallenge = (params: { userId: string; userAgent?: string | null; ip?: string | null }) => {
  cleanupExpired();
  const id = crypto.randomUUID();
  store.set(id, {
    id,
    userId: params.userId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    userAgentHash: hashOptional(params.userAgent),
    ipHash: hashOptional(params.ip),
  });
  return id;
};

export const consumePreAuthChallenge = (params: { challengeId: string; userId: string; userAgent?: string | null; ip?: string | null }) => {
  const result = validatePreAuthChallenge(params);
  if (!result.ok) return false;
  store.delete(params.challengeId);
  return true;
};

export const validatePreAuthChallenge = (params: { challengeId: string; userId: string; userAgent?: string | null; ip?: string | null }) => {
  const record = store.get(params.challengeId);
  cleanupExpired();
  if (!record) return { ok: false as const, reason: 'missing_or_reused' as const };
  if (record.expiresAt <= Date.now()) {
    store.delete(params.challengeId);
    return { ok: false as const, reason: 'expired' as const };
  }
  if (record.userId !== params.userId) return { ok: false as const, reason: 'user_mismatch' as const };
  if (record.userAgentHash !== hashOptional(params.userAgent) || record.ipHash !== hashOptional(params.ip)) {
    return { ok: false as const, reason: 'context_mismatch' as const };
  }
  return { ok: true as const };
};

export const consumePreAuthChallengeStrict = (params: { challengeId: string; userId: string; userAgent?: string | null; ip?: string | null }) => {
  const result = validatePreAuthChallenge(params);
  if (!result.ok) return result;
  store.delete(params.challengeId);
  return result;
};

export const consumePreAuthChallengeLegacy = (params: { challengeId: string; userId: string; userAgent?: string | null; ip?: string | null }) => {
  cleanupExpired();
  const record = store.get(params.challengeId);
  if (!record) return false;
  const matches =
    record.userId === params.userId &&
    record.expiresAt > Date.now() &&
    record.userAgentHash === hashOptional(params.userAgent) &&
    record.ipHash === hashOptional(params.ip);
  if (!matches) return false;
  store.delete(params.challengeId);
  return true;
};

export const __testOnlyExpireChallenge = (challengeId: string) => {
  const existing = store.get(challengeId);
  if (!existing) return;
  store.set(challengeId, { ...existing, expiresAt: Date.now() - 1 });
};
