import { getRedisClient } from '@/lib/redis-client';

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const getDefaultWindowMs = () => {
  const value = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(value) && value > 0 ? value : 15 * 60 * 1000;
};

const getDefaultMax = () => {
  const value = Number(process.env.RATE_LIMIT_MAX_REQUESTS);
  return Number.isFinite(value) && value > 0 ? value : 100;
};

export async function rateLimitShared(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const windowMs = options.windowMs ?? getDefaultWindowMs();
  const max = options.max ?? getDefaultMax();
  const now = Date.now();
  const resetAt = now + windowMs;
  const redisKey = `ratelimit:${key}`;
  const client = await getRedisClient();

  const currentCount = await client.incr(redisKey);
  if (currentCount === 1) {
    await client.pExpire(redisKey, windowMs);
  }

  const ttlMs = await client.pTTL(redisKey);
  const effectiveResetAt = ttlMs > 0 ? now + ttlMs : resetAt;
  const remaining = Math.max(max - currentCount, 0);

  return {
    allowed: currentCount <= max,
    remaining,
    resetAt: effectiveResetAt,
  };
}

export function getRateLimitHeaders(result: RateLimitResult, max = getDefaultMax()) {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
