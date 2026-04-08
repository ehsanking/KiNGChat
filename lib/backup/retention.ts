import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export const cleanupExpiredLocalBackups = async () => {
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;

  const outputDir = process.env.BACKUP_OUTPUT_DIR || path.join(process.cwd(), 'backups');
  const expirationTs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = await readdir(outputDir).catch(() => [] as string[]);

  for (const file of files) {
    if (!file.startsWith('backup-')) continue;
    const target = path.join(outputDir, file);
    const info = await stat(target).catch(() => null);
    if (info && info.mtimeMs < expirationTs) {
      await unlink(target).catch(() => {});
    }
  }
};
