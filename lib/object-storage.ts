import path from 'path';
import { mkdir, readFile, writeFile, stat, rm, readdir } from 'fs/promises';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';

export type PutResult = {
  key: string;
  bucket: string;
  etag: string;
  storageUrl: string;
};

export interface ObjectStorageDriver {
  put(key: string, data: Buffer, metadata?: Record<string, string>): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

const storageRoot = path.join(process.cwd(), process.env.OBJECT_STORAGE_ROOT || 'object_storage');
const privateBucket = process.env.OBJECT_STORAGE_PRIVATE_BUCKET || 'private';

const resolveKeyPath = (bucket: string, key: string) => path.join(storageRoot, bucket, key);

class LocalDriver implements ObjectStorageDriver {
  async put(key: string, data: Buffer): Promise<PutResult> {
    const target = resolveKeyPath(privateBucket, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return {
      key,
      bucket: privateBucket,
      etag: crypto.createHash('sha256').update(data).digest('hex'),
      storageUrl: `object://${privateBucket}/${key}`,
    };
  }

  get(key: string): Promise<Buffer> {
    return readFile(resolveKeyPath(privateBucket, key));
  }

  async delete(key: string): Promise<void> {
    await rm(resolveKeyPath(privateBucket, key), { force: true });
  }

  async getSignedUrl(key: string): Promise<string> {
    return `object://${privateBucket}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(resolveKeyPath(privateBucket, key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix = ''): Promise<string[]> {
    const root = resolveKeyPath(privateBucket, prefix);
    const entries: string[] = [];
    const walk = async (dir: string) => {
      const dirEntries = await readdir(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else entries.push(path.relative(resolveKeyPath(privateBucket, ''), full).replaceAll('\\', '/'));
      }
    };
    try {
      await walk(root);
    } catch {
      return [];
    }
    return entries;
  }
}

class S3Driver implements ObjectStorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || privateBucket;
    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
        : undefined,
    });
  }

  async put(key: string, data: Buffer, metadata?: Record<string, string>): Promise<PutResult> {
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, Metadata: metadata }));
    return { key, bucket: this.bucket, etag: result.ETag || '', storageUrl: `s3://${this.bucket}/${key}` };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes || []);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return getS3SignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix = ''): Promise<string[]> {
    const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    return (result.Contents || []).map((item) => item.Key).filter((key): key is string => Boolean(key));
  }
}

let driver: ObjectStorageDriver | null = null;

export const getObjectStorageMode = () => (process.env.OBJECT_STORAGE_DRIVER || 'local').toLowerCase();
export const getObjectStorageRoot = () => storageRoot;

export const getObjectStorageDriver = (): ObjectStorageDriver => {
  if (driver) return driver;
  driver = getObjectStorageMode() === 's3' ? new S3Driver() : new LocalDriver();
  return driver;
};

export const putPrivateObject = (key: string, buffer: Buffer, metadata?: Record<string, string>) => getObjectStorageDriver().put(key, buffer, metadata);
export const getPrivateObject = (key: string) => getObjectStorageDriver().get(key);
export const deletePrivateObject = (key: string) => getObjectStorageDriver().delete(key);
export const statPrivateObject = async (key: string) => ({ exists: await getObjectStorageDriver().exists(key) });
export const getPrivateObjectPath = (key: string) => resolveKeyPath(privateBucket, key);
export const listPrivateObjects = (prefix?: string) => getObjectStorageDriver().list(prefix);

export const checkObjectStorageReadiness = async () => {
  const mode = getObjectStorageMode();
  if (mode !== 's3') return { status: 'not_configured' as const };

  try {
    await getObjectStorageDriver().list('');
    return { status: 'up' as const };
  } catch (error) {
    return { status: 'down' as const, error: error instanceof Error ? error.message : String(error) };
  }
};
