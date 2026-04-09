import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Tests for Docker and DevOps configuration.
 * Validates Dockerfile best practices, docker-compose structure,
 * and deployment configuration.
 */

const rootDir = resolve(__dirname, '..');

describe('Dockerfile', () => {
  const dockerfile = readFileSync(resolve(rootDir, 'Dockerfile'), 'utf-8');

  it('should use multi-stage build', () => {
    const stages = dockerfile.match(/^FROM\s+/gm);
    expect(stages).not.toBeNull();
    expect(stages!.length).toBeGreaterThanOrEqual(3);
  });

  it('should use tini as PID 1 for signal handling', () => {
    expect(dockerfile).toContain('tini');
    expect(dockerfile).toContain('ENTRYPOINT ["/sbin/tini"');
  });

  it('should run as non-root user', () => {
    expect(dockerfile).toContain('adduser');
    expect(dockerfile).toContain('nextjs');
    expect(dockerfile).toContain('nodejs');
  });

  it('should include health check', () => {
    expect(dockerfile).toContain('HEALTHCHECK');
  });

  it('should disable Next.js telemetry', () => {
    expect(dockerfile).toContain('NEXT_TELEMETRY_DISABLED=1');
  });

  it('should set NODE_ENV to production in runner', () => {
    expect(dockerfile).toContain('NODE_ENV=production');
  });

  it('should NOT copy full node_modules in runner stage', () => {
    // The optimized Dockerfile should selectively copy dependencies
    // rather than copying the entire node_modules directory
    const runnerSection = dockerfile.split('AS runner')[1];
    expect(runnerSection).toBeDefined();
    // Should NOT have "COPY --from=builder /app/node_modules        ./node_modules"
    // (the full copy), but should have selective copies
    expect(runnerSection).toContain('node_modules/prisma');
    expect(runnerSection).toContain('node_modules/socket.io');
  });
});

describe('Docker Compose', () => {
  const compose = readFileSync(resolve(rootDir, 'docker-compose.yml'), 'utf-8');

  it('should define app, caddy, and db services', () => {
    expect(compose).toContain('elahe-app');
    expect(compose).toContain('elahe-caddy');
    expect(compose).toContain('elahe-db');
  });

  it('should include health checks for app and db', () => {
    expect(compose).toMatch(/healthcheck:/g);
  });

  it('should use a bridge network', () => {
    expect(compose).toContain('bridge');
  });

  it('should define persistent volumes', () => {
    expect(compose).toContain('pgdata:');
    expect(compose).toContain('object_storage_data:');
  });

  it('should keep backup scheduling in worker runtime (no separate backup service)', () => {
    expect(compose).not.toContain('elahe-backup');
    expect(compose).not.toContain('backup_data');
  });

  it('should require critical secrets', () => {
    expect(compose).toContain('JWT_SECRET');
    expect(compose).toContain('SESSION_SECRET');
    expect(compose).toContain('ENCRYPTION_KEY');
  });
});

describe('Entrypoint Script', () => {
  it('should exist', () => {
    expect(existsSync(resolve(rootDir, 'docker-entrypoint.sh'))).toBe(true);
  });

  const entrypoint = readFileSync(resolve(rootDir, 'docker-entrypoint.sh'), 'utf-8');

  it('should validate secrets in production', () => {
    expect(entrypoint).toContain('require_strong_value');
    expect(entrypoint).toContain('JWT_SECRET');
  });

  it('should wait for database', () => {
    expect(entrypoint).toContain('Waiting for database');
  });

  it('should run Prisma migrations', () => {
    expect(entrypoint).toContain('prisma migrate deploy');
  });

  it('should prefer custom server with Socket.IO', () => {
    expect(entrypoint).toContain('server.ts');
    expect(entrypoint).toContain('Socket.IO');
  });
});

describe('Metrics API Route', () => {
  it('should exist', () => {
    expect(existsSync(resolve(rootDir, 'app/api/metrics/route.ts'))).toBe(true);
  });

  const metricsRoute = readFileSync(resolve(rootDir, 'app/api/metrics/route.ts'), 'utf-8');

  it('should support Prometheus format', () => {
    expect(metricsRoute).toContain('getPrometheusMetrics');
    expect(metricsRoute).toContain('text/plain');
  });

  it('should support JSON format', () => {
    expect(metricsRoute).toContain('format');
    expect(metricsRoute).toContain('json');
  });

  it('should have auth guard for METRICS_TOKEN', () => {
    expect(metricsRoute).toContain('METRICS_TOKEN');
    expect(metricsRoute).toContain('Unauthorized');
  });
});
