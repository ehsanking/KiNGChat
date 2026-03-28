import { describe, expect, it } from 'vitest';
import { isSqliteUrl, resolvePrismaSchemaPath } from '@/lib/prisma-schema';

describe('prisma schema resolution', () => {
  it('detects sqlite URLs', () => {
    expect(isSqliteUrl('file:./prisma/dev.db')).toBe(true);
    expect(isSqliteUrl('postgresql://user:pass@db:5432/elahe')).toBe(false);
  });

  it('resolves sqlite schema path for sqlite URLs', () => {
    const root = '/workspace/ElaheMessenger';
    expect(resolvePrismaSchemaPath(root, 'file:./prisma/dev.db')).toContain('schema.sqlite.prisma');
  });

  it('resolves postgres schema path for non-sqlite URLs', () => {
    const root = '/workspace/ElaheMessenger';
    expect(resolvePrismaSchemaPath(root, 'postgresql://user:pass@db:5432/elahe')).toContain('schema.prisma');
    expect(resolvePrismaSchemaPath(root, 'postgresql://user:pass@db:5432/elahe')).not.toContain('schema.sqlite.prisma');
  });
});
