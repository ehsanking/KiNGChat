import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const ALLOWED_TTL_SECONDS = [5, 30, 60, 300, 3600, 86400, 604800] as const;
export type AllowedTtlSeconds = (typeof ALLOWED_TTL_SECONDS)[number];

export function normalizeTtlSeconds(value: unknown): AllowedTtlSeconds | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return ALLOWED_TTL_SECONDS.includes(value as AllowedTtlSeconds)
    ? (value as AllowedTtlSeconds)
    : null;
}

export async function scheduleMessageExpiry(messageId: string, ttlSeconds: number | null | undefined) {
  const normalized = normalizeTtlSeconds(ttlSeconds);
  if (!normalized) {
    return prisma.message.update({
      where: { id: messageId },
      data: { expiresAt: null, ttlSeconds: null },
    });
  }

  const expiresAt = new Date(Date.now() + normalized * 1000);
  return prisma.message.update({
    where: { id: messageId },
    data: { expiresAt, ttlSeconds: normalized },
  });
}

export async function runExpiryCleanup() {
  const now = new Date();
  const result = await prisma.message.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });
  return { deletedCount: result.count, now: now.toISOString() };
}

let expiryCleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startExpiryCleanupJob(intervalMs = 60_000) {
  if (expiryCleanupInterval) return;
  expiryCleanupInterval = setInterval(() => {
    void runExpiryCleanup()
      .then((summary) => {
        if (summary.deletedCount > 0) {
          logger.info('Disappearing message cleanup removed expired messages.', summary);
        }
      })
      .catch((error) => {
        logger.error('Disappearing message cleanup failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, intervalMs);
}

export function stopExpiryCleanupJob() {
  if (!expiryCleanupInterval) return;
  clearInterval(expiryCleanupInterval);
  expiryCleanupInterval = null;
}
