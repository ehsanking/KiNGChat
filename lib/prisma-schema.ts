import path from 'path';

export function isSqliteUrl(databaseUrl: string): boolean {
  return databaseUrl.trim().startsWith('file:');
}

export function resolvePrismaSchemaPath(rootDir: string, databaseUrl: string): string {
  return isSqliteUrl(databaseUrl)
    ? path.join(rootDir, 'prisma', 'schema.sqlite.prisma')
    : path.join(rootDir, 'prisma', 'schema.prisma');
}
