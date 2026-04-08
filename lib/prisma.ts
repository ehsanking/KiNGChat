import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { observeHistogram } from '@/lib/observability';

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

const shouldUsePgBouncer = (databaseUrl: string): boolean => {
  if (process.env.PGBOUNCER_ENABLED === 'true') return true;
  if (!databaseUrl.startsWith('postgres')) return false;

  try {
    const url = new URL(databaseUrl);
    const host = url.hostname.toLowerCase();
    const port = url.port;
    return host.includes('pgbouncer') || port === '6432';
  } catch {
    return false;
  }
};

const applyPgBouncerParam = (databaseUrl: string) => {
  if (!shouldUsePgBouncer(databaseUrl)) return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
};

/**
 * Detect whether we are running inside the Next.js static-analysis / build phase.
 * During `next build`, Next.js sets NEXT_PHASE=phase-production-build which means
 * no real database connection is needed — the build just analyses the code structure.
 * We must NOT throw for a missing DATABASE_URL during this phase.
 */
const isBuildPhase = (): boolean =>
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export';

/**
 * Resolve the DATABASE_URL at runtime.
 *
 * Priority order:
 *   1. DATABASE_URL environment variable (Docker Compose, .env, .env.local)
 *   2. SQLite fallback in development: file:./prisma/dev.db
 *   3. Dummy placeholder during `next build` (no real DB access occurs at build time)
 */
const resolveDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Allow the build to proceed without a real DB connection.
  // The actual DB is only needed at runtime, not at build/lint time.
  if (isBuildPhase()) {
    return 'file:./prisma/dev.db';
  }

  // Default to SQLite in development / first-run scenarios
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
const configuredDatabaseUrl = applyPgBouncerParam(applyConnectionLimit(databaseUrl, process.env.PRISMA_CONNECTION_LIMIT));

const prismaLogConfig = process.env.NODE_ENV === 'development'
  ? [{ emit: 'event' as const, level: 'query' as const }, 'info' as const, 'warn' as const, 'error' as const]
  : [{ emit: 'event' as const, level: 'query' as const }, 'warn' as const, 'error' as const];

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: prismaLogConfig,
    datasources: {
      db: {
        url: configuredDatabaseUrl,
      },
    },
  });

if (process.env.NODE_ENV === 'development') {
  (prisma as PrismaClient).$on('query' as never, (event: any) => {
    logger.debug('Prisma query executed', {
      durationMs: event.duration,
      query: event.query,
      target: event.target,
    });
  });
} else {
  (prisma as PrismaClient).$on('query' as never, (event: any) => {
    const durationMs = Number(event.duration);
    observeHistogram('elahe_db_query_duration_seconds', durationMs / 1000);
    if (durationMs <= 100) return;
    logger.warn('Slow Prisma query detected', {
      durationMs,
      query: event.query,
      target: event.target,
    });
  });
}

export { prisma };

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
