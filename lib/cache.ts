import { logger } from '@/lib/logger';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  size: number;
};

type CacheOptions = {
  ttlMs?: number;
};

/**
 * LRU Cache with size limits and automatic eviction.
 *
 * Addresses the following architectural issues:
 * - Size-bounded: prevents unbounded memory growth (memory leak).
 * - LRU eviction: removes least-recently-used entries when capacity is reached.
 * - Periodic cleanup: expired entries are pruned on a timer.
 * - Redis integration: when REDIS_URL is set, cache operations use Redis for
 *   cross-instance consistency in multi-node deployments.
 */
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 10_000;
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

const store = new Map<string, CacheEntry<unknown>>();

// Track insertion order for LRU eviction.  Map iteration order is insertion
// order in JS, so we move accessed keys to the end on read.
const touchKey = (key: string) => {
  const entry = store.get(key);
  if (entry) {
    store.delete(key);
    store.set(key, entry);
  }
};

const evictLRU = () => {
  while (store.size > MAX_ENTRIES) {
    // Map iterator yields oldest entry first
    const oldest = store.keys().next().value;
    if (oldest !== undefined) {
      store.delete(oldest);
    } else {
      break;
    }
  }
};

const pruneExpired = () => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
};

// Start periodic cleanup to avoid stale entries accumulating
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const ensureCleanupTimer = () => {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(pruneExpired, CLEANUP_INTERVAL_MS);
  // Allow the Node process to exit even if the timer is still running
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
};

const getDefaultTtl = () => {
  const ttl = Number(process.env.CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30_000;
};

// ── Redis helpers ──────────────────────────────────────────
let redisAvailable: boolean | null = null;

const getRedisForCache = async () => {
  if (redisAvailable === false) return null;
  if (!process.env.REDIS_URL) {
    redisAvailable = false;
    return null;
  }
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const client = await getRedisClient();
    redisAvailable = true;
    return client;
  } catch {
    redisAvailable = false;
    return null;
  }
};

// ── Public API ─────────────────────────────────────────────

export const getCachedValue = <T>(key: string): T | null => {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  touchKey(key);
  return entry.value as T;
};

export const setCachedValue = <T>(key: string, value: T, options: CacheOptions = {}) => {
  ensureCleanupTimer();
  const ttlMs = options.ttlMs ?? getDefaultTtl();
  const serialized = JSON.stringify(value);
  const size = serialized ? serialized.length : 0;
  store.set(key, { value, expiresAt: Date.now() + ttlMs, size });
  evictLRU();
};

export const getOrSetCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> => {
  // Try local cache first
  const localCached = getCachedValue<T>(key);
  if (localCached !== null) return localCached;

  // Try Redis cache if available
  const redis = await getRedisForCache();
  if (redis) {
    try {
      const redisKey = `cache:${key}`;
      const raw = await redis.get(redisKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        setCachedValue(key, parsed, options);
        return parsed;
      }
    } catch (err) {
      logger.warn('Redis cache read failed, falling back to fetcher', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const value = await fetcher();
  setCachedValue(key, value, options);

  // Write-through to Redis
  if (redis) {
    try {
      const ttlMs = options.ttlMs ?? getDefaultTtl();
      const redisKey = `cache:${key}`;
      await redis.set(redisKey, JSON.stringify(value), { PX: ttlMs });
    } catch {
      // Silently ignore write-through failures
    }
  }

  return value;
};

export const invalidateCache = async (key: string) => {
  store.delete(key);
  const redis = await getRedisForCache();
  if (redis) {
    try {
      await redis.del(`cache:${key}`);
    } catch {
      // Ignore
    }
  }
};

export const invalidateCacheByPrefix = async (prefix: string) => {
  // Clear local cache
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  
  // Clear Redis cache using SCAN for safe prefix deletion
  const redis = await getRedisForCache();
  if (redis) {
    try {
      const redisPrefix = `cache:${prefix}`;
      let cursor = '0';
      const matchPattern = `${redisPrefix}*`;
      const scanBatchSize = 100; // Process 100 keys at a time
      
      do {
        // Use SCAN to iterate through keys matching the pattern
        const result = await redis.scan(cursor, {
          MATCH: matchPattern,
          COUNT: scanBatchSize,
        });
        
        cursor = result.cursor.toString();
        const keys = result.keys;
        
        // Delete matched keys in batches
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
      
      logger.debug('Redis prefix invalidation completed', { prefix, matchPattern });
    } catch (err) {
      logger.warn('Redis prefix invalidation failed', {
        prefix,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

export const conversationCacheKey = (userId: string, conversationKey: string, cursor = 'head') =>
  `conversation:${userId}:${conversationKey}:${cursor}`;

export const getCacheStats = () => ({
  entries: store.size,
  maxEntries: MAX_ENTRIES,
});
