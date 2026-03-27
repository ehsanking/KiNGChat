import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const AUTH_USER_COLUMNS_SQL = [
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "needsPasswordChange" BOOLEAN NOT NULL DEFAULT false;',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockoutUntil" TIMESTAMP(3);',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;',
];

const isUserSchemaMismatch = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021' && error.code !== 'P2022') return false;

  const table = (error.meta as { table?: unknown } | undefined)?.table;
  const column = (error.meta as { column?: unknown } | undefined)?.column;

  const tableMatch = typeof table === 'string' ? table.includes('User') : false;
  const columnMatch = typeof column === 'string'
    ? ['needsPasswordChange', 'failedLoginAttempts', 'lockoutUntil', 'totpSecret', 'totpEnabled']
      .some((name) => column.includes(name))
    : false;

  return tableMatch || columnMatch;
};

let authUserColumnsEnsured = false;

export const ensureAuthUserColumns = async () => {
  if (authUserColumnsEnsured) return;

  logger.warn('User auth columns missing. Applying runtime compatibility patch.');
  for (const statement of AUTH_USER_COLUMNS_SQL) {
    await prisma.$executeRawUnsafe(statement);
  }
  authUserColumnsEnsured = true;
};

export const recoverAuthUserSchemaIfNeeded = async (error: unknown) => {
  if (!isUserSchemaMismatch(error)) return false;
  await ensureAuthUserColumns();
  return true;
};
