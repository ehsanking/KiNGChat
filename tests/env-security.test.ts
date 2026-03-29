import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from '@/lib/env-security';
import fs from 'fs';
import os from 'os';
import path from 'path';

const validBase = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(40),
  SESSION_SECRET: 's'.repeat(40),
  ENCRYPTION_KEY: 'e'.repeat(40),
  DOWNLOAD_TOKEN_SECRET: 'd'.repeat(40),
  ADMIN_PASSWORD: 'StrongAdminPassword1',
  ADMIN_USERNAME: 'owner',
  APP_DB_PASSWORD: 'StrongAppDbPassword1',
  APP_DB_USER: 'elahe_app',
  DATABASE_URL: 'postgresql://user:strongpass@db:5432/elahe',
  APP_URL: 'https://chat.example.com',
  ALLOWED_ORIGINS: 'https://chat.example.com',
};

describe('validateProductionEnvironment', () => {
  it('rejects placeholder admin username and placeholder database url', () => {
    Object.assign(process.env, validBase, {
      ADMIN_USERNAME: '__SET_ME_ADMIN_USERNAME__',
      DATABASE_URL: 'postgresql://__SET_ME_APP_DB_USER__:__SET_ME_APP_DB_PASSWORD__@db:5432/elahe',
    });

    expect(() => validateProductionEnvironment()).toThrowError();
  });

  it('passes when all production values are non-placeholder and strong', () => {
    Object.assign(process.env, validBase);

    expect(() => validateProductionEnvironment()).not.toThrow();
  });

  it('accepts bootstrap password file in place of ADMIN_PASSWORD', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elahe-env-'));
    const passwordFile = path.join(dir, 'bootstrap-pass');
    fs.writeFileSync(passwordFile, 'StrongAdminPassword1\n', 'utf8');
    Object.assign(process.env, validBase, {
      ADMIN_PASSWORD: '',
      ADMIN_BOOTSTRAP_PASSWORD_FILE: passwordFile,
    });

    expect(() => validateProductionEnvironment()).not.toThrow();
  });

  it('requires LOCAL_CAPTCHA_SECRET when CAPTCHA_PROVIDER is local', () => {
    Object.assign(process.env, validBase, {
      CAPTCHA_PROVIDER: 'local',
      LOCAL_CAPTCHA_SECRET: '',
    });
    expect(() => validateProductionEnvironment()).toThrowError();
  });
});
