import path from 'path';

export function isSqliteUrl(databaseUrl: string): boolean {
  return databaseUrl.trim().startsWith('file:');
}

export function resolvePrismaSchemaPath(rootDir: string, databaseUrl: string): string {
  if (process.env.PRISMA_SCHEMA_TARGET === 'postgres') {
    return path.join(rootDir, 'prisma', 'schema.prisma');
  }
  if (process.env.PRISMA_SCHEMA_TARGET === 'sqlite') {
    return path.join(rootDir, 'prisma', 'schema.sqlite.prisma');
  }
  return isSqliteUrl(databaseUrl)
    ? path.join(rootDir, 'prisma', 'schema.sqlite.prisma')
    : path.join(rootDir, 'prisma', 'schema.prisma');
}
