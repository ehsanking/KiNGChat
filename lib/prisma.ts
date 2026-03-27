import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const applyConnectionLimit = (databaseUrl: string, limit?: string) => {
  if (!limit) return databaseUrl;
  // SQLite does not support connection_limit query param
  if (databaseUrl.startsWith('file:')) return databaseUrl;
  if (!databaseUrl.startsWith('postgres') && !databaseUrl.startsWith('mysql')) return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', limit);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
};

/**
 * Resolve the DATABASE_URL at runtime. If DATABASE_URL is not set, fall back
 * to a local SQLite file so that the application can start without any external
 * database in development / first-run scenarios.
 *
 * Priority order:
 *   1. DATABASE_URL environment variable (set by Docker Compose, .env, .env.local)
 *   2. SQLite fallback (development only): file:./prisma/dev.db
 */
const resolveDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Default to SQLite only in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    const fallback = 'file:./prisma/dev.db';
    process.env.DATABASE_URL = fallback;
    return fallback;
  }

  throw new Error(
    'DATABASE_URL environment variable is required in production. ' +
    'Set it to a valid PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/db).'
  );
};

const databaseUrl = resolveDatabaseUrl();

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: applyConnectionLimit(databaseUrl, process.env.PRISMA_CONNECTION_LIMIT),
      },
    },
  });

export { prisma };

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
