import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import type { BackupStrategy } from '@/lib/backup/strategy';

export class PrismaExportStrategy implements BackupStrategy {
  name = 'prisma-export';

  async run() {
    const tmpDir = path.join(process.cwd(), '.tmp', 'backups');
    await mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `prisma-${Date.now()}.json`);

    const [users, settings, reports, groups, messageCount] = await Promise.all([
      prisma.user.findMany({ select: { id: true, username: true, role: true, createdAt: true } }),
      prisma.adminSettings.findMany(),
      prisma.report.findMany(),
      prisma.group.findMany({ select: { id: true, name: true, createdAt: true } }),
      prisma.message.count(),
    ]);

    const payload = {
      type: 'prisma-export',
      exportedAt: new Date().toISOString(),
      stats: { users: users.length, groups: groups.length, reports: reports.length, messageCount },
      data: { users, settings, reports, groups },
    };

    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { filePath, metadata: payload.stats };
  }
}
