import { triggerBackupNow } from '@/lib/backup/service';

async function main() {
  const result = await triggerBackupNow({ source: 'cli' });
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error('[backup] Backup failed:', error);
  process.exitCode = 1;
});
