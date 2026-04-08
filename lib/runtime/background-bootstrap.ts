import { registerBackgroundJob, startBackgroundJobWorker, enqueueBackgroundJob } from '../task-queue';
import { sendPushNotification } from '../push';
import { logger } from '../logger';
import { incrementMetric } from '../observability';

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

  // ── Automated backup job ──────────────────────────────────────
  registerBackgroundJob('scheduled_backup', async () => {
    try {
      const { mkdir, writeFile, readdir, unlink, stat } = await import('fs/promises');
      const path = await import('path');
      const { prisma } = await import('../prisma');

      const outputDir = process.env.BACKUP_OUTPUT_DIR || path.join(process.cwd(), 'backups');
      const maxRetention = Number(process.env.BACKUP_MAX_RETENTION) || 30;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(outputDir, `backup-${timestamp}.json`);
      const startTime = Date.now();

      await mkdir(outputDir, { recursive: true });

      const [users, settings, reports, auditLogs, groups, messages] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true, username: true, numericId: true, role: true, badge: true,
            isApproved: true, isBanned: true, isVerified: true, createdAt: true,
          },
        }),
        prisma.adminSettings.findMany(),
        prisma.report.findMany(),
        prisma.auditLog.findMany({ take: 10_000, orderBy: { createdAt: 'desc' } }),
        prisma.group.findMany({
          select: { id: true, name: true, createdAt: true },
        }),
        prisma.message.count(),
      ]);

      const payload = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        stats: { users: users.length, groups: groups.length, messages, reports: reports.length, auditLogs: auditLogs.length, settings: settings.length },
        data: { users, groups, settings, reports, auditLogs },
      };

      await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
      const fileStat = await stat(outputPath);
      logger.info('Scheduled backup completed', { path: outputPath, sizeKB: (fileStat.size / 1024).toFixed(1), durationMs: payload.durationMs });
      incrementMetric('backup_completed');

      // Rotate old backups
      const files = await readdir(outputDir);
      const backupFiles = files.filter((f) => f.startsWith('backup-') && f.endsWith('.json')).sort();
      if (backupFiles.length > maxRetention) {
        const toDelete = backupFiles.slice(0, backupFiles.length - maxRetention);
        for (const file of toDelete) {
          await unlink(path.join(outputDir, file));
        }
        logger.info('Rotated old backups', { deleted: toDelete.length });
      }
    } catch (error) {
      incrementMetric('backup_failed');
      logger.error('Scheduled backup failed', { error: error instanceof Error ? error.message : String(error) });
      throw error; // Let the job queue handle retry
    }
  });
}

/**
 * Interval handle for the backup scheduler (for testing / shutdown).
 */
let backupInterval: ReturnType<typeof setInterval> | null = null;

export async function startRuntimeWorker() {
  await startBackgroundJobWorker();
  logger.info('Background job worker started.');

  // ── Schedule periodic backups ───────────────────────────────
  // Default: every 24 hours. Set BACKUP_INTERVAL_MS to customize.
  const backupIntervalMs = Number(process.env.BACKUP_INTERVAL_MS) || 24 * 60 * 60 * 1000;
  const backupEnabled = process.env.BACKUP_ENABLED !== 'false';

  if (backupEnabled) {
    // Run first backup 5 minutes after startup
    setTimeout(() => {
      void enqueueBackgroundJob({ name: 'scheduled_backup', payload: {} });
    }, 5 * 60 * 1000);

    backupInterval = setInterval(() => {
      void enqueueBackgroundJob({ name: 'scheduled_backup', payload: {} });
    }, backupIntervalMs);

    logger.info('Backup scheduler enabled', { intervalMs: backupIntervalMs });
  }
}

/** Stop the backup scheduler (useful for graceful shutdown). */
export function stopBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
