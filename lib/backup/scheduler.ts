import cron from 'node-cron';
import { logger } from '@/lib/logger';
import { triggerBackupNow } from '@/lib/backup/service';

let backupTask: cron.ScheduledTask | null = null;

export const startBackupScheduler = () => {
  const enabled = String(process.env.BACKUP_ENABLED ?? 'true').toLowerCase() === 'true';
  if (!enabled) return;

  const schedule = process.env.BACKUP_SCHEDULE || '0 3 * * *';
  backupTask = cron.schedule(schedule, () => {
    void triggerBackupNow({ source: 'scheduler' });
  });
  logger.info('Backup scheduler started', { schedule });
};

export const stopBackupScheduler = () => {
  backupTask?.stop();
  backupTask = null;
};
