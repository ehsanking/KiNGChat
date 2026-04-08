import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const getRetentionPolicyConfig = () => ({
  auditLogsDays: parsePositiveInt(process.env.RETENTION_AUDIT_LOGS_DAYS, 365),
  loginAttemptsDays: parsePositiveInt(process.env.RETENTION_LOGIN_ATTEMPTS_DAYS, 90),
  expiredCaptchasHours: parsePositiveInt(process.env.RETENTION_EXPIRED_CAPTCHAS_HOURS, 24),
  revokedDevicesDays: parsePositiveInt(process.env.RETENTION_REVOKED_DEVICES_DAYS, 30),
  consumedPreKeysDays: parsePositiveInt(process.env.RETENTION_CONSUMED_PREKEYS_DAYS, 7),
});

export type RetentionCleanupSummary = {
  auditLogsDeleted: number;
  loginAttemptsDeleted: number;
  expiredCaptchasDeleted: number;
  consumedPreKeysDeleted: number;
  revokedDevicesDeleted: number;
};

export async function runRetentionCleanup(): Promise<RetentionCleanupSummary> {
  const now = Date.now();
  const config = getRetentionPolicyConfig();

  const auditLogsBefore = new Date(now - config.auditLogsDays * DAY_IN_MS);
  const loginAttemptsBefore = new Date(now - config.loginAttemptsDays * DAY_IN_MS);
  const expiredCaptchasBefore = new Date(now - config.expiredCaptchasHours * HOUR_IN_MS);
  const consumedPreKeysBefore = new Date(now - config.consumedPreKeysDays * DAY_IN_MS);
  const revokedDevicesBefore = new Date(now - config.revokedDevicesDays * DAY_IN_MS);

  const [auditLogs, loginAttempts, captchas, consumedPreKeys, revokedDevices] = await Promise.all([
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditLogsBefore } },
    }),
    prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: loginAttemptsBefore } },
    }),
    prisma.captcha.deleteMany({
      where: { expiresAt: { lt: expiredCaptchasBefore } },
    }),
    prisma.oneTimePreKey.deleteMany({
      where: {
        status: 'CONSUMED',
        OR: [
          { consumedAt: { lt: consumedPreKeysBefore } },
          {
            AND: [
              { consumedAt: null },
              { updatedAt: { lt: consumedPreKeysBefore } },
            ],
          },
        ],
      },
    }),
    prisma.userDevice.deleteMany({
      where: {
        isRevoked: true,
        updatedAt: { lt: revokedDevicesBefore },
      },
    }),
  ]);

  const summary: RetentionCleanupSummary = {
    auditLogsDeleted: auditLogs.count,
    loginAttemptsDeleted: loginAttempts.count,
    expiredCaptchasDeleted: captchas.count,
    consumedPreKeysDeleted: consumedPreKeys.count,
    revokedDevicesDeleted: revokedDevices.count,
  };

  logger.info('Retention cleanup completed.', summary);

  return summary;
}
