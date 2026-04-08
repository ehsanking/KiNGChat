import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type BackupStorageDriver = {
  upload: (filePath: string, filename: string) => Promise<{ key: string; path: string }>;
};

const createLocalDriver = (): BackupStorageDriver => ({
  upload: async (filePath, filename) => {
    const outputDir = process.env.BACKUP_OUTPUT_DIR || path.join(process.cwd(), 'backups');
    await mkdir(outputDir, { recursive: true });
    const target = path.join(outputDir, filename);
    await copyFile(filePath, target);
    return { key: filename, path: target };
  },
});

const createS3Driver = (): BackupStorageDriver => ({
  upload: async (filePath, filename) => {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { readFile } = await import('node:fs/promises');
    const bucket = process.env.BACKUP_S3_BUCKET;
    if (!bucket) throw new Error('BACKUP_S3_BUCKET is required for S3 storage.');

    const client = new S3Client({ region: process.env.BACKUP_S3_REGION || process.env.AWS_REGION || 'us-east-1' });
    const body = await readFile(filePath);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: filename, Body: body }));
    return { key: filename, path: `s3://${bucket}/${filename}` };
  },
});

export const getBackupStorageDriver = (): BackupStorageDriver => {
  const mode = (process.env.BACKUP_STORAGE || 'local').toLowerCase();
  if (mode === 's3') return createS3Driver();
  return createLocalDriver();
};
