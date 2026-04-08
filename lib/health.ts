import { prisma } from '@/lib/prisma';
import { pingRedis } from '@/lib/redis-client';
import { getBackgroundQueueSnapshot } from '@/lib/task-queue';
import { getMetricsSnapshot } from '@/lib/observability';
import { checkObjectStorageReadiness, getObjectStorageMode } from '@/lib/object-storage';
import { getShardingStrategy } from '@/lib/sharding';
import { statfs } from 'node:fs/promises';

export async function getLivenessSnapshot() {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  };
}

export async function getReadinessSnapshot() {
  const now = new Date();
  let databaseHealthy = false;
  let redisHealthy = !process.env.REDIS_URL;
  let databaseResponseTimeMs: number | null = null;
  let redisResponseTimeMs: number | null = null;

  try {
    const start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    databaseHealthy = true;
    databaseResponseTimeMs = Number((performance.now() - start).toFixed(2));
  } catch {
    databaseHealthy = false;
  }

  if (process.env.REDIS_URL) {
    try {
      const start = performance.now();
      await pingRedis();
      redisHealthy = true;
      redisResponseTimeMs = Number((performance.now() - start).toFixed(2));
    } catch {
      redisHealthy = false;
    }
  }

  const queue = await getBackgroundQueueSnapshot();
  const metrics = getMetricsSnapshot();
  const storageReadiness = await checkObjectStorageReadiness();
  const status = databaseHealthy ? (redisHealthy ? 'ok' : 'degraded') : 'down';
  const memory = process.memoryUsage();
  const totalMemory = Math.max(1, memory.heapTotal);
  const memoryUsagePercent = Number(((memory.heapUsed / totalMemory) * 100).toFixed(2));
  let disk: { status: 'up' | 'down' | 'unknown'; freeBytes: number | null; totalBytes: number | null } = {
    status: 'unknown',
    freeBytes: null,
    totalBytes: null,
  };
  try {
    const fsStat = await statfs(process.cwd());
    const totalBytes = Number(fsStat.blocks) * Number(fsStat.bsize);
    const freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
    disk = { status: freeBytes > 0 ? 'up' : 'down', freeBytes, totalBytes };
  } catch {
    disk = { status: 'unknown', freeBytes: null, totalBytes: null };
  }

  return {
    status,
    httpStatus: databaseHealthy ? 200 : 503,
    payload: {
      status,
      timestamp: now.toISOString(),
      uptime: Math.round(process.uptime()),
      database: databaseHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : process.env.REDIS_URL ? 'down' : 'not_configured',
      components: {
        database: { status: databaseHealthy ? 'up' : 'down', responseTimeMs: databaseResponseTimeMs },
        redis: {
          status: redisHealthy ? 'up' : process.env.REDIS_URL ? 'down' : 'not_configured',
          responseTimeMs: redisResponseTimeMs,
        },
        disk,
        memory: {
          status: memoryUsagePercent < 95 ? 'up' : 'degraded',
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          rssBytes: memory.rss,
          usagePercent: memoryUsagePercent,
        },
      },
      queue,
      storage: { mode: getObjectStorageMode(), readiness: storageReadiness },
      sharding: getShardingStrategy(),
      observability: {
        counters: metrics.counters.slice(-20),
        gauges: metrics.gauges,
        startedAt: new Date(metrics.startedAt).toISOString(),
      },
    },
  };
}
