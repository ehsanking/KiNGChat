import { registerBackgroundJob, startBackgroundJobWorker, enqueueBackgroundJob } from '../task-queue';
import { sendPushNotification } from '../push';
import { logger } from '../logger';
import { incrementMetric } from '../observability';
import { prisma } from '../prisma';
import { runRetentionCleanup } from '../retention-policy';
import { startExpiryCleanupJob } from '../disappearing-messages';
import { getBackupStatus, triggerBackupNow } from '../backup/service';
import { startBackupScheduler, stopBackupScheduler as stopBackupCronScheduler } from '../backup/scheduler';


const RETENTION_CLEANUP_LOCK_ID = 94642013;
let retentionCleanupRunning = false;

const tryAcquireRetentionLock = async () => {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    return true;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    `SELECT pg_try_advisory_lock(${RETENTION_CLEANUP_LOCK_ID}) AS locked`,
  );

  return Boolean(rows?.[0]?.locked);
};

const releaseRetentionLock = async () => {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    return;
  }
  await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${RETENTION_CLEANUP_LOCK_ID})`);
};

export function registerRuntimeJobs() {
  registerBackgroundJob('push_notification', async (payload) => {
    const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : '';
    if (!recipientId) return;

    await sendPushNotification(recipientId, {
      title: typeof payload.title === 'string' ? payload.title : 'New Message',
      body: typeof payload.body === 'string' ? payload.body : 'You have received a new encrypted message.',
      url: typeof payload.url === 'string' ? payload.url : '/chat',
    });
  });

  registerBackgroundJob('retention_cleanup', async () => {
    if (retentionCleanupRunning) {
      logger.warn('Retention cleanup already running in this process. Skipping duplicate run.');
      return;
    }

    const lockAcquired = await tryAcquireRetentionLock();
    if (!lockAcquired) {
      logger.info('Retention cleanup lock is held by another worker. Skipping run.');
      return;
    }

    retentionCleanupRunning = true;
    try {
      const summary = await runRetentionCleanup();
      logger.info('Retention cleanup job completed.', summary);
      incrementMetric('retention_cleanup_completed');
    } catch (error) {
      incrementMetric('retention_cleanup_failed');
      logger.error('Retention cleanup job failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      retentionCleanupRunning = false;
      await releaseRetentionLock();
    }
  });

  registerBackgroundJob('scheduled_backup', async () => {
    try {
      await triggerBackupNow({ source: 'worker' });
      incrementMetric('backup_completed');
    } catch (error) {
      incrementMetric('backup_failed');
      logger.error('Scheduled backup failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}

/**
 * Interval handle for retention scheduler (for testing / shutdown).
 */
let retentionCleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function startRuntimeWorker() {
  await startBackgroundJobWorker();
  logger.info('Background job worker started.');

  startBackupScheduler();
  const backupStatus = getBackupStatus();
  logger.info('Backup scheduler enabled', backupStatus);

  const retentionIntervalMs = 24 * 60 * 60 * 1000;
  void enqueueBackgroundJob({ name: 'retention_cleanup', payload: {} });
  retentionCleanupInterval = setInterval(() => {
    void enqueueBackgroundJob({ name: 'retention_cleanup', payload: {} });
  }, retentionIntervalMs);
  logger.info('Retention cleanup scheduler enabled', { intervalMs: retentionIntervalMs });

  startExpiryCleanupJob(60_000);
}

/** Stop the backup scheduler (useful for graceful shutdown). */
export function stopBackupScheduler() {
  stopBackupCronScheduler();
  if (retentionCleanupInterval) {
    clearInterval(retentionCleanupInterval);
    retentionCleanupInterval = null;
  }
}
