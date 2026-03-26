import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const isMissingLoginAttemptTableError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021') return false;
  const table = (error.meta as { table?: unknown } | undefined)?.table;
  return typeof table === 'string' && table.includes('LoginAttempt');
};

async function createLoginAttemptTableIfMissing() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoginAttempt" (
      "id" TEXT NOT NULL,
      "ip" TEXT NOT NULL,
      "username" TEXT,
      "success" BOOLEAN NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx"
    ON "LoginAttempt"("ip", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LoginAttempt_username_createdAt_idx"
    ON "LoginAttempt"("username", "createdAt");
  `);
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
        createdAt: { gte: since }
      }
    });
  } catch (error) {
    if (!isMissingLoginAttemptTableError(error)) throw error;
    await ensureLoginAttemptTable();
    return prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: since }
      }
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
