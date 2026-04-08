import { getRedisClient } from '@/lib/redis-client';

export class RedisCache {
  constructor(private readonly namespacePrefix = 'cache') {}

  private key(namespace: string, key: string) {
    return `${this.namespacePrefix}:${namespace}:${key}`;
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    const client = await getRedisClient();
    const raw = await client.get(this.key(namespace, key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(namespace: string, key: string, value: T, ttlMs: number): Promise<void> {
    const client = await getRedisClient();
    await client.set(this.key(namespace, key), JSON.stringify(value), { PX: ttlMs });
  }

  async del(namespace: string, key: string): Promise<void> {
    const client = await getRedisClient();
    await client.del(this.key(namespace, key));
  }

  async delByPrefix(namespace: string, prefix: string): Promise<void> {
    const client = await getRedisClient();
    let cursor = '0';
    do {
      const result = await client.scan(cursor, { MATCH: `${this.namespacePrefix}:${namespace}:${prefix}*`, COUNT: 100 });
      cursor = String(result.cursor);
      if (result.keys.length > 0) {
        await client.del(...result.keys);
      }
    } while (cursor !== '0');
  }
}
