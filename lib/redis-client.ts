import { logger } from '@/lib/logger';

/**
 * C5 fix: Properly typed Redis client module.
 *
 * Defines a strict RedisClientType interface covering the subset of
 * Redis commands used throughout the codebase.  This replaces the
 * previous `Promise<any>` types that defeated TypeScript's safety.
 */

/**
 * Minimal typed interface for the subset of Redis commands used in this project.
 * This avoids importing the full `redis` type definitions at the module level
 * (which would fail if the optional `redis` package is not installed) while
 * still providing type safety for all call sites.
 */
export interface RedisClientLike {
  // String commands
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX?: number; EX?: number; NX?: boolean }): Promise<string | null>;
  del(...key: string[]): Promise<number>;
  incr(key: string): Promise<number>;

  // TTL commands
  pttl(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<boolean>;
  scan(
    cursor: string,
    options?: {
      MATCH?: string;
      COUNT?: number;
    },
  ): Promise<{ cursor: string | number; keys: string[] }>;

  // List commands
  lLen(key: string): Promise<number>;
  rPush(key: string, value: string | string[]): Promise<number>;
  blPop(key: string, timeout: number): Promise<{ key: string; element: string } | null>;

  // Sorted set commands
  zAdd(key: string, members: Array<{ score: number; value: string }>): Promise<number>;
  zCard(key: string): Promise<number>;
  zRangeByScore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zRem(key: string, member: string | string[]): Promise<number>;

  // Transaction
  multi(): RedisMultiLike;

  // Connection
  ping(): Promise<string>;
  duplicate(): RedisClientLike;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  quit(): Promise<string>;

  // Events
  on(event: string, listener: (error: unknown) => void): void;
}

export interface RedisMultiLike {
  zRem(key: string, member: string | string[]): RedisMultiLike;
  rPush(key: string, value: string | string[]): RedisMultiLike;
  exec(): Promise<unknown[]>;
}

// ── Module loading ──────────────────────────────────────────

type RedisModuleType = {
  createClient: (options: { url: string }) => RedisClientLike;
};

let redisModulePromise: Promise<RedisModuleType> | null = null;
let redisClientPromise: Promise<RedisClientLike> | null = null;

async function loadRedisModule(): Promise<RedisModuleType> {
  if (!redisModulePromise) {
    redisModulePromise = import('redis') as unknown as Promise<RedisModuleType>;
  }
  return redisModulePromise;
}

export async function getRedisClient(): Promise<RedisClientLike> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for shared-state runtime.');
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = await loadRedisModule();
      const client = createClient({ url: redisUrl });
      client.on('error', (error: unknown) => {
        logger.error('Redis client error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      await client.connect();
      return client;
    })();
  }

  return redisClientPromise;
}

export async function pingRedis(): Promise<string> {
  const client = await getRedisClient();
  return client.ping();
}
