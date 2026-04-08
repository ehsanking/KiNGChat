import { incrementMetric } from '@/lib/observability';
import { logger } from '@/lib/logger';
import { MemoryCache } from './memory-cache';
import { RedisCache } from './redis-cache';

export type CacheNamespace = 'user-profile' | 'group-info' | 'conversation-metadata' | 'admin-settings' | 'session-lookup' | 'default';

type CacheOptions = { ttlMs?: number; namespace?: CacheNamespace };

const memory = new MemoryCache();
const redis = process.env.REDIS_URL ? new RedisCache() : null;

const defaultTtlMs = () => Number(process.env.CACHE_TTL_MS) || 30_000;

export const getCachedValue = <T>(key: string): T | null => memory.get<T>(`default:${key}`);

export const setCachedValue = <T>(key: string, value: T, options: CacheOptions = {}) => {
  const ttlMs = options.ttlMs ?? defaultTtlMs();
  const ns = options.namespace ?? 'default';
  memory.set(`${ns}:${key}`, value, ttlMs);
};

export const getOrSetCache = async <T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}): Promise<T> => {
  const ttlMs = options.ttlMs ?? defaultTtlMs();
  const ns = options.namespace ?? 'default';
  const memoryKey = `${ns}:${key}`;

  const inMemory = memory.get<T>(memoryKey);
  if (inMemory !== null) {
    incrementMetric('cache_hit', 1, { layer: 'memory', namespace: ns });
    return inMemory;
  }

  if (redis) {
    try {
      const inRedis = await redis.get<T>(ns, key);
      if (inRedis !== null) {
        memory.set(memoryKey, inRedis, ttlMs);
        incrementMetric('cache_hit', 1, { layer: 'redis', namespace: ns });
        return inRedis;
      }
    } catch (error) {
      logger.warn('Redis cache read failed', { key, namespace: ns, error: error instanceof Error ? error.message : String(error) });
    }
  }

  incrementMetric('cache_miss', 1, { namespace: ns });
  const value = await fetcher();
  memory.set(memoryKey, value, ttlMs);
  if (redis) {
    await redis.set(ns, key, value, ttlMs).catch(() => undefined);
  }
  return value;
};

export const invalidateCache = async (key: string, namespace: CacheNamespace = 'default') => {
  memory.del(`${namespace}:${key}`);
  if (redis) {
    await redis.del(namespace, key).catch(() => undefined);
  }
};

export const invalidateCacheByPrefix = async (prefix: string, namespace: CacheNamespace = 'default') => {
  memory.delByPrefix(`${namespace}:${prefix}`);
  if (redis) {
    await redis.delByPrefix(namespace, prefix).catch(() => undefined);
  }
};

export const conversationCacheKey = (userId: string, conversationKey: string, cursor = 'head') =>
  `conversation:${userId}:${conversationKey}:${cursor}`;

export const getCacheStats = () => memory.stats();

export const invalidateUserProfileCache = async (userId: string) => invalidateCache(userId, 'user-profile');
export const invalidateGroupInfoCache = async (groupId: string) => invalidateCache(groupId, 'group-info');
export const invalidateAdminSettingsCache = async () => invalidateCache('adminSettings', 'admin-settings');
