import { describe, expect, it, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    message: {
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { normalizeTtlSeconds, runExpiryCleanup, scheduleMessageExpiry } from '@/lib/disappearing-messages';

describe('disappearing messages', () => {
  beforeEach(() => {
    prismaMock.message.update.mockReset();
    prismaMock.message.deleteMany.mockReset();
  });

  it('normalizes TTL values using allowlist', () => {
    expect(normalizeTtlSeconds(60)).toBe(60);
    expect(normalizeTtlSeconds(61)).toBeNull();
    expect(normalizeTtlSeconds(null)).toBeNull();
  });

  it('schedules expiry with expiresAt and ttlSeconds', async () => {
    prismaMock.message.update.mockResolvedValue({ id: 'm1' });
    await scheduleMessageExpiry('m1', 60);
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm1' },
      data: expect.objectContaining({ ttlSeconds: 60, expiresAt: expect.any(Date) }),
    }));
  });

  it('cleanup deletes expired messages', async () => {
    prismaMock.message.deleteMany.mockResolvedValue({ count: 3 });
    const result = await runExpiryCleanup();
    expect(result.deletedCount).toBe(3);
    expect(prismaMock.message.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { expiresAt: { lt: expect.any(Date) } },
    }));
  });
});
