import { describe, expect, it, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('object storage driver selection', () => {
  it('defaults to local driver', async () => {
    const storage = await import('@/lib/object-storage');
    expect(storage.getObjectStorageMode()).toBe('local');
  });

  it('reports s3 mode when configured', async () => {
    vi.stubEnv('OBJECT_STORAGE_DRIVER', 's3');
    const storage = await import('@/lib/object-storage');
    expect(storage.getObjectStorageMode()).toBe('s3');
  });
});
