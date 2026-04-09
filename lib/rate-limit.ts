type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

type RateLimitPresetOptions = Readonly<Required<RateLimitOptions>>;
export type RateLimitPresetName =
  | 'login'
  | 'register'
  | '2fa'
  | 'password-recovery'
  | 'upload'
  | 'api-default'
  | 'e2ee'
  | 'admin';

import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis-client';
import { incrementMetric, setGauge } from '@/lib/observability';

/**
 * In-memory rate limit store with automatic cleanup and queue size limits.
 *
 * Fixes: 
 * - Memory leak caused by expired entries never being removed.
 * - Unbounded memory growth from unlimited queue size.
 * 
 * Features:
 * - Periodic cleanup runs every 60 seconds to prune expired entries.
 * - Hard cap (MAX_STORE_SIZE) prevents unbounded memory growth even
 *   under high cardinality (many unique IPs).
 * - Queue size limit (MAX_QUEUE_SIZE) to reject new entries when system is overloaded.
 */
const MAX_STORE_SIZE = Number(process.env.RATE_LIMIT_MAX_STORE_SIZE) || 50_000;
const MAX_QUEUE_SIZE = Number(process.env.RATE_LIMIT_MAX_QUEUE_SIZE) || 100_000;
const CLEANUP_INTERVAL_MS = 60_000;

const store = new Map<string, RateLimitEntry>();

const pruneExpiredEntries = (): void => {
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
      pruned++;
    }
  }
  if (pruned > 0) {
    logger.debug('Rate limit store pruned expired entries', { pruned, remaining: store.size });
  }
  setGauge('rate_limit_store_size', store.size);
};

const evictOldestIfNeeded = (): void => {
  if (store.size <= MAX_STORE_SIZE) return;
  // Evict oldest entries (first inserted) until we're under the cap
  const toEvict = store.size - MAX_STORE_SIZE;
  let evicted = 0;
  for (const key of store.keys()) {
    if (evicted >= toEvict) break;
    store.delete(key);
    evicted++;
  }
  incrementMetric('rate_limit_evictions', evicted);
};

// Start cleanup timer
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const ensureCleanupTimer = (): void => {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(pruneExpiredEntries, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
};

const getDefaultWindowMs = (): number => {
  const value = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(value) && value > 0 ? value : 15 * 60 * 1000;
};

const getDefaultMax = (): number => {
  const value = Number(process.env.RATE_LIMIT_MAX_REQUESTS);
  return Number.isFinite(value) && value > 0 ? value : 100;
};

export const rateLimitPresets: Record<RateLimitPresetName, RateLimitPresetOptions> = {
  login: { windowMs: 15 * 60 * 1000, max: 5 },
  register: { windowMs: 60 * 60 * 1000, max: 3 },
  '2fa': { windowMs: 5 * 60 * 1000, max: 5 },
  'password-recovery': { windowMs: 60 * 60 * 1000, max: 3 },
  upload: { windowMs: 10 * 60 * 1000, max: 20 },
  'api-default': { windowMs: 15 * 60 * 1000, max: 100 },
  e2ee: { windowMs: 60_000, max: 30 },
  admin: { windowMs: 60_000, max: 60 },
};

export function rateLimitPreset(name: RateLimitPresetName): RateLimitPresetOptions {
  if (name === 'api-default') {
    return {
      windowMs: getDefaultWindowMs(),
      max: getDefaultMax(),
    };
  }

  return rateLimitPresets[name];
}

const getFailClosedPrefixes = (): string[] =>
  (process.env.RATE_LIMIT_FAIL_CLOSED_PREFIXES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const shouldFailClosedOnRedisError = (key: string): boolean => {
  const prefixes = getFailClosedPrefixes();
  return prefixes.some((prefix) => key.startsWith(prefix));
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Perform a rate limit check for the given key. If a Redis URL is configured via
 * `process.env.REDIS_URL`, the rate limit state is stored in Redis for
 * cross-instance consistency. Otherwise a fallback in-memory map is used. The
 * check is performed as an atomic increment in Redis with an expiration set on
 * first use. If Redis is unavailable, the fallback is used and an error is
 * logged.
 */
export async function rateLimit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  ensureCleanupTimer();

  const windowMs = options.windowMs ?? getDefaultWindowMs();
  const max = options.max ?? getDefaultMax();
  const now = Date.now();
  const scopedKey = `rl:${key}`;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const client = await getRedisClient();
      // Atomically increment the request count for this key.
      const count: number = await client.incr(scopedKey);
      // Fetch the current TTL (in milliseconds). Returns -2 if the key does not exist and -1 if no expiry set.
      let pttl: number = await client.pttl(scopedKey);
      // If there is no TTL on the key or the key didn't exist before, set the TTL.
      if (pttl === -1 || pttl === -2) {
        await client.pexpire(scopedKey, windowMs);
        pttl = windowMs;
      }
      // Determine remaining attempts and when the window resets.
      const remaining = Math.max(max - count, 0);
      const resetAt = now + (typeof pttl === 'number' ? pttl : windowMs);
      if (count > max) {
        incrementMetric('rate_limit_blocked', 1, { store: 'redis' });
        return { allowed: false, remaining: 0, resetAt };
      }
      incrementMetric('rate_limit_allowed', 1, { store: 'redis' });
      return { allowed: true, remaining, resetAt };
    } catch (error) {
      logger.error('Rate limiting with Redis failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (shouldFailClosedOnRedisError(key)) {
        incrementMetric('rate_limit_blocked', 1, { store: 'redis_error', mode: 'fail_closed' });
        return { allowed: false, remaining: 0, resetAt: now + windowMs };
      }
      // Continue to fallback
    }
  }

  // Fallback to in-memory implementation when Redis is not configured or on error.
  // Check queue size limit before processing
  if (store.size >= MAX_QUEUE_SIZE) {
    incrementMetric('rate_limit_queue_full', 1, { store: 'memory' });
    logger.warn('Rate limit queue is full, rejecting request', {
      queueSize: store.size,
      maxQueueSize: MAX_QUEUE_SIZE,
      key,
    });
    return { allowed: false, remaining: 0, resetAt: now + windowMs };
  }
  
  const entry = store.get(scopedKey);
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(scopedKey, { count: 1, resetAt });
    evictOldestIfNeeded();
    incrementMetric('rate_limit_allowed', 1, { store: 'memory' });
    return { allowed: true, remaining: Math.max(max - 1, 0), resetAt };
  }
  if (entry.count >= max) {
    incrementMetric('rate_limit_blocked', 1, { store: 'memory' });
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  store.set(scopedKey, entry);
  incrementMetric('rate_limit_allowed', 1, { store: 'memory' });
  return { allowed: true, remaining: Math.max(max - entry.count, 0), resetAt: entry.resetAt };
}

/**
 * Build HTTP response headers for the computed rate-limit result.
 */
export function getRateLimitHeaders(result: RateLimitResult, max = getDefaultMax()): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(max),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

/**
 * Return current in-memory rate-limit store utilization statistics.
 */
export const getRateLimitStoreStats = (): {
  size: number;
  maxSize: number;
  maxQueueSize: number;
  utilizationPercent: number;
} => ({
  size: store.size,
  maxSize: MAX_STORE_SIZE,
  maxQueueSize: MAX_QUEUE_SIZE,
  utilizationPercent: Math.round((store.size / MAX_QUEUE_SIZE) * 100),
});


export type RateLimitedHandler = (request: NextRequest) => Promise<Response>;

export async function withRateLimit(presetName: RateLimitPresetName, handler: RateLimitedHandler): Promise<(request: NextRequest) => Promise<Response>> {
  const preset = rateLimitPreset(presetName);
  return async (request: NextRequest): Promise<Response> => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
    const key = `${presetName}:${ip}:${request.nextUrl.pathname}`;
    const result = await rateLimit(key, preset);
    const headers = {
      ...getRateLimitHeaders(result, preset.max),
      'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
    };

    if (!result.allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers });
    }

    const response = await handler(request);
    Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
    return response;
  };
}
