import crypto from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/lib/logger';
import { PrismaExportStrategy } from '@/lib/backup/prisma-export';
import { PgDumpStrategy } from '@/lib/backup/pg-dump';
import { getBackupStorageDriver } from '@/lib/backup/storage';
import { cleanupExpiredLocalBackups } from '@/lib/backup/retention';
import type { BackupResult, BackupStrategy } from '@/lib/backup/strategy';

let lastBackupStatus: { lastRunAt?: string; lastSuccessAt?: string; lastError?: string; lastStorageKey?: string } = {};

const selectStrategy = (): BackupStrategy => {
  if ((process.env.DATABASE_URL || '').startsWith('postgres')) return new PgDumpStrategy();
  return new PrismaExportStrategy();
};

const maybeEncryptBackup = async (filePath: string): Promise<{ path: string; encrypted: boolean }> => {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) return { path: filePath, encrypted: false };

  const source = await readFile(filePath);
  const iv = crypto.randomBytes(16);
  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(source), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const target = `${filePath}.enc`;
  await writeFile(target, Buffer.concat([iv, authTag, encrypted]));
  return { path: target, encrypted: true };
};

export const triggerBackupNow = async ({ source }: { source: string }): Promise<BackupResult> => {
  const startedAt = new Date().toISOString();
  lastBackupStatus.lastRunAt = startedAt;

  const tmpDir = path.join(process.cwd(), '.tmp', 'backups', 'atomic');
  await mkdir(tmpDir, { recursive: true });

  try {
    const strategy = selectStrategy();
    const driver = getBackupStorageDriver();
    const { filePath, metadata } = await strategy.run();
    const { path: preparedPath, encrypted } = await maybeEncryptBackup(filePath);

    const fileExt = path.extname(preparedPath) || '.bin';
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}${fileExt}`;
    const stagingPath = path.join(tmpDir, `${filename}.tmp`);
    await copyFile(preparedPath, stagingPath);

    const finalizedPath = stagingPath.replace(/\.tmp$/, '');
    await rename(stagingPath, finalizedPath);

    const uploaded = await driver.upload(finalizedPath, filename);
    const fileMeta = await stat(finalizedPath);

    await cleanupExpiredLocalBackups();

    const result: BackupResult = {
      storageKey: uploaded.key,
      outputPath: uploaded.path,
      createdAt: startedAt,
      sizeBytes: fileMeta.size,
      encrypted,
      metadata: { strategy: strategy.name, source, ...metadata },
    };

    lastBackupStatus = { ...lastBackupStatus, lastSuccessAt: startedAt, lastStorageKey: uploaded.key, lastError: undefined };
    logger.info('Backup completed', { storageKey: uploaded.key, source, encrypted, strategy: strategy.name });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastBackupStatus = { ...lastBackupStatus, lastError: message };
    logger.error('Backup failed', { error: message, source });
    throw error;
  }
};

export const getBackupStatus = () => lastBackupStatus;
