import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BackupStrategy } from '@/lib/backup/strategy';

const execFileAsync = promisify(execFile);

export class PgDumpStrategy implements BackupStrategy {
  name = 'pg-dump';

  async run() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for pg-dump backups.');

    const tmpDir = path.join(process.cwd(), '.tmp', 'backups');
    await mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `pg-${Date.now()}.sqlc`);

    await execFileAsync('pg_dump', ['--format=custom', '--file', filePath, databaseUrl], {
      env: process.env,
      maxBuffer: 1024 * 1024 * 8,
    });

    return { filePath, metadata: { format: 'custom', database: 'postgresql' } };
  }
}
