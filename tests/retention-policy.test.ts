import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteManyMock, loggerInfoMock } = vi.hoisted(() => ({
  deleteManyMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { deleteMany: deleteManyMock },
    loginAttempt: { deleteMany: deleteManyMock },
    captcha: { deleteMany: deleteManyMock },
    oneTimePreKey: { deleteMany: deleteManyMock },
    userDevice: { deleteMany: deleteManyMock },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
  },
}));

import { getRetentionPolicyConfig, runRetentionCleanup } from '@/lib/retention-policy';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  deleteManyMock.mockReset();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('retention-policy', () => {
  it('uses default retention policy values', () => {
    delete process.env.RETENTION_AUDIT_LOGS_DAYS;
    delete process.env.RETENTION_LOGIN_ATTEMPTS_DAYS;
    delete process.env.RETENTION_EXPIRED_CAPTCHAS_HOURS;
    delete process.env.RETENTION_REVOKED_DEVICES_DAYS;
    delete process.env.RETENTION_CONSUMED_PREKEYS_DAYS;

    expect(getRetentionPolicyConfig()).toEqual({
      auditLogsDays: 365,
      loginAttemptsDays: 90,
      expiredCaptchasHours: 24,
      revokedDevicesDays: 30,
      consumedPreKeysDays: 7,
    });
  });

  it('returns cleanup summary structure', async () => {
    deleteManyMock
      .mockResolvedValueOnce({ count: 11 })
      .mockResolvedValueOnce({ count: 22 })
      .mockResolvedValueOnce({ count: 33 })
      .mockResolvedValueOnce({ count: 44 })
      .mockResolvedValueOnce({ count: 55 });

    const result = await runRetentionCleanup();

    expect(result).toEqual({
      auditLogsDeleted: 11,
      loginAttemptsDeleted: 22,
      expiredCaptchasDeleted: 33,
      consumedPreKeysDeleted: 44,
      revokedDevicesDeleted: 55,
    });
    expect(loggerInfoMock).toHaveBeenCalledWith('Retention cleanup completed.', result);
  });

  it('supports environment variable overrides', () => {
    process.env.RETENTION_AUDIT_LOGS_DAYS = '730';
    process.env.RETENTION_LOGIN_ATTEMPTS_DAYS = '14';
    process.env.RETENTION_EXPIRED_CAPTCHAS_HOURS = '8';
    process.env.RETENTION_REVOKED_DEVICES_DAYS = '120';
    process.env.RETENTION_CONSUMED_PREKEYS_DAYS = '2';

    expect(getRetentionPolicyConfig()).toEqual({
      auditLogsDays: 730,
      loginAttemptsDays: 14,
      expiredCaptchasHours: 8,
      revokedDevicesDays: 120,
      consumedPreKeysDays: 2,
    });
  });
});
