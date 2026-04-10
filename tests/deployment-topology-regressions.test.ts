import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deployment topology regressions', () => {
  it('keeps monolith compose free of split runtime services and backup container', () => {
    const compose = fs.readFileSync('docker-compose.yml', 'utf8');
    expect(compose).not.toContain('container_name: elahe-api');
    expect(compose).not.toContain('container_name: elahe-worker');
    expect(compose).not.toContain('container_name: elahe-backup');
  });

  it('passes APP_DB_USER and APP_DB_PASSWORD to the app service so env-security validation succeeds', () => {
    // Regression: lib/env-security.ts calls requireEnv('APP_DB_PASSWORD') and
    // requireEnv('APP_DB_USER') in production. If docker-compose.yml only
    // exposes these to the db service, the app container crash-loops on
    // startup with "APP_DB_PASSWORD is required."
    const compose = fs.readFileSync('docker-compose.yml', 'utf8');
    const appSection = compose.slice(
      compose.indexOf('  app:'),
      compose.indexOf('  db:'),
    );
    expect(appSection).toContain('APP_DB_USER=${APP_DB_USER');
    expect(appSection).toContain('APP_DB_PASSWORD=${APP_DB_PASSWORD');
  });

  it('defines explicit split topology in compose.split.yaml', () => {
    const split = fs.readFileSync('compose.split.yaml', 'utf8');
    expect(split).toContain('container_name: elahe-api');
    expect(split).toContain('container_name: elahe-worker');
    expect(split).toContain('RUNTIME_MODE=api');
    expect(split).toContain('RUNTIME_MODE=worker');
    expect(split).toContain('depends_on:');
    expect(split).toContain('api:');
  });

  it('installer summary never prints raw database passwords', () => {
    // Database credentials must never appear in the installer summary — they
    // are long-lived least-privilege secrets and are already recorded in .env.
    // The admin login password is intentionally printed so the operator can
    // capture it on first install (see the "prints admin credentials" test).
    const install = fs.readFileSync('install.sh', 'utf8');
    expect(install).not.toContain('Database app password:');
    expect(install).not.toContain('Database admin password:');
    expect(install).not.toContain('POSTGRES_PASSWORD=${POSTGRES_PASSWORD}');
    expect(install).not.toContain('APP_DB_PASSWORD=${APP_DB_PASSWORD}');
  });

  it('installer summary prints admin credentials so the operator can capture them', () => {
    // Operator explicitly requested that the bootstrap admin username and
    // password be displayed in the success summary after a fresh install.
    const install = fs.readFileSync('install.sh', 'utf8');
    expect(install).toContain('Admin login username:');
    expect(install).toContain('${ADMIN_PASSWORD_VALUE}');
    expect(install).toContain('store this password in a secure vault');
  });
});
