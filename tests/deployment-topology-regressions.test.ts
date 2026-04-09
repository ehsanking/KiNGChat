import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deployment topology regressions', () => {
  it('keeps monolith compose free of split runtime services and backup container', () => {
    const compose = fs.readFileSync('docker-compose.yml', 'utf8');
    expect(compose).not.toContain('container_name: elahe-api');
    expect(compose).not.toContain('container_name: elahe-worker');
    expect(compose).not.toContain('container_name: elahe-backup');
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

  it('installer summary never prints raw passwords', () => {
    const install = fs.readFileSync('install.sh', 'utf8');
    expect(install).not.toContain('Admin login password: ${summary_admin_password}');
    expect(install).not.toContain('Database app password: ${summary_db_app_password}');
    expect(install).not.toContain('Database admin password: ${summary_db_admin_password}');
    expect(install).toContain('Admin password is never printed.');
  });
});
