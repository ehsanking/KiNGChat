import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadApplicationEnvironment, readProjectEnv } from '@/lib/env-loader';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('env-loader', () => {
  it('loads .env and .env.local for development mode with .env.local override', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'elahe-env-dev-'));
    fs.writeFileSync(path.join(cwd, '.env'), 'APP_URL=http://env\nDATABASE_URL=file:./a.db\n', 'utf8');
    fs.writeFileSync(path.join(cwd, '.env.local'), 'APP_URL=http://env-local\nJWT_SECRET=dev-secret\n', 'utf8');

    loadApplicationEnvironment({ cwd, forceMode: 'development' });

    expect(process.env.APP_URL).toBe('http://env-local');
    expect(process.env.DATABASE_URL).toBe('file:./a.db');
    expect(process.env.JWT_SECRET).toBe('dev-secret');

    const snapshot = readProjectEnv({ cwd, mode: 'development' });
    expect(snapshot.APP_URL).toBe('http://env-local');
  });

  it('loads only .env for production mode', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'elahe-env-prod-'));
    fs.writeFileSync(path.join(cwd, '.env'), 'APP_URL=https://prod\n', 'utf8');
    fs.writeFileSync(path.join(cwd, '.env.local'), 'APP_URL=http://should-not-load\n', 'utf8');

    loadApplicationEnvironment({ cwd, forceMode: 'production' });

    expect(process.env.APP_URL).toBe('https://prod');
  });
});
