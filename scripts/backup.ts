import { mkdir, writeFile, readdir, unlink, stat } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';

/**
 * Enhanced backup script with:
 * - Automatic rotation: keeps only the last N backups (default: 30).
 * - Structured output with metadata for restore verification.
 * - Graceful error handling and exit codes.
 *
 * Usage:
 *   npx tsx scripts/backup.ts
 *
 * Environment:
 *   BACKUP_OUTPUT_DIR    - Directory for backup files (default: ./backups)
 *   BACKUP_MAX_RETENTION - Max backups to retain (default: 30)
 */

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = process.env.BACKUP_OUTPUT_DIR || path.join(process.cwd(), 'backups');
const outputPath = path.join(outputDir, `backup-${timestamp}.json`);
const maxRetention = Number(process.env.BACKUP_MAX_RETENTION) || 30;

const rotateOldBackups = async () => {
  try {
    const files = await readdir(outputDir);
    const backupFiles = files
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();

    if (backupFiles.length <= maxRetention) return;

    const toDelete = backupFiles.slice(0, backupFiles.length - maxRetention);
    for (const file of toDelete) {
      const filePath = path.join(outputDir, file);
      await unlink(filePath);
      console.log(`[backup] Rotated old backup: ${file}`);
    }
  } catch (error) {
    console.error('[backup] Failed to rotate old backups:', error);
  }
};

const runBackup = async () => {
  const startTime = Date.now();
  try {
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
      durationMs: 0,
      stats: {
        users: users.length,
        groups: groups.length,
        messages,
        reports: reports.length,
        auditLogs: auditLogs.length,
        settings: settings.length,
      },
      data: {
        users,
        groups,
        settings,
        reports,
        auditLogs,
      },
    };

    payload.durationMs = Date.now() - startTime;

    await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
    const fileStat = await stat(outputPath);
    console.log(`[backup] Backup saved to ${outputPath} (${(fileStat.size / 1024).toFixed(1)} KB, ${payload.durationMs}ms)`);

    await rotateOldBackups();

    console.log(`[backup] Completed successfully.`);
  } catch (error) {
    console.error('[backup] Backup failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void runBackup();
