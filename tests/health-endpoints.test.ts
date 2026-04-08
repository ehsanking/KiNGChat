import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/redis-client', () => ({
  pingRedis: vi.fn(),
}));

vi.mock('@/lib/task-queue', () => ({
  getBackgroundQueueSnapshot: vi.fn(async () => ({ mode: 'local' })),
}));

vi.mock('@/lib/observability', () => ({
  getMetricsSnapshot: vi.fn(() => ({ counters: [], gauges: {}, startedAt: Date.now() })),
}));

vi.mock('@/lib/object-storage', () => ({
  getObjectStorageMode: vi.fn(() => 'local'),
  checkObjectStorageReadiness: vi.fn(async () => ({ status: 'not_configured' })),
}));

vi.mock('@/lib/sharding', () => ({
  getShardingStrategy: vi.fn(() => 'single'),
}));

import { prisma } from '@/lib/prisma';
import { pingRedis } from '@/lib/redis-client';
import { getLivenessSnapshot, getReadinessSnapshot } from '@/lib/health';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.REDIS_URL;
});

describe('health snapshots', () => {
  it('keeps liveness healthy regardless of redis configuration', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    const live = await getLivenessSnapshot();
    expect(live.status).toBe('ok');
  });

  it('returns readiness degraded but HTTP 200 when db is up and optional redis is down', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);
    vi.mocked(pingRedis).mockRejectedValueOnce(new Error('redis down'));

    const ready = await getReadinessSnapshot();
    expect(ready.status).toBe('degraded');
    expect(ready.httpStatus).toBe(200);
    expect(ready.payload.redis).toBe('down');
  });

  it('returns readiness down when database is unavailable', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('db down'));

    const ready = await getReadinessSnapshot();
    expect(ready.status).toBe('down');
    expect(ready.httpStatus).toBe(503);
  });
});
