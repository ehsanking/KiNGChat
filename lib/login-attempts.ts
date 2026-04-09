import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * C6 fix: All raw SQL queries now use Prisma's tagged template literals
 * ($executeRaw / $queryRaw) instead of $executeRawUnsafe.
 *
 * Tagged templates use parameterised queries under the hood, which prevents
 * SQL injection even if the query strings are ever modified to include
 * dynamic values in the future.  $executeRawUnsafe accepts plain strings
 * and is inherently vulnerable to injection if user input is ever
 * interpolated — using the safe variant closes this attack vector.
 */

const isMissingLoginAttemptTableError = (error: unknown) => {
  if (!(error instanceof PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021') return false;
  const table = (error.meta as { table?: unknown } | undefined)?.table;
  return typeof table === 'string' && table.includes('LoginAttempt');
};

async function createLoginAttemptTableIfMissing() {
  // C6 fix: Use $executeRaw tagged template — safe against SQL injection
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "LoginAttempt" (
      "id" TEXT NOT NULL,
      "ip" TEXT NOT NULL,
      "username" TEXT,
      "success" BOOLEAN NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx"
    ON "LoginAttempt"("ip", "createdAt")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "LoginAttempt_username_createdAt_idx"
    ON "LoginAttempt"("username", "createdAt")
  `;
}

async function ensureLoginAttemptTable() {
  logger.warn('LoginAttempt table missing. Creating table at runtime fallback path.');
  await createLoginAttemptTableIfMissing();
}

export async function countFailedIpAttempts(ip: string, since: Date) {
  try {
    return await prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: since },
      },
    });
  } catch (error) {
    if (!isMissingLoginAttemptTableError(error)) throw error;
    await ensureLoginAttemptTable();
    return prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: since },
      },
    });
  }
}

export async function createLoginAttempt(ip: string, username: string, success: boolean) {
  try {
    await prisma.loginAttempt.create({ data: { ip, username, success } });
  } catch (error) {
    if (!isMissingLoginAttemptTableError(error)) throw error;
    await ensureLoginAttemptTable();
    await prisma.loginAttempt.create({ data: { ip, username, success } });
  }
}
