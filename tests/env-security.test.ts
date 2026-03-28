import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from '@/lib/env-security';

const validBase = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(40),
  SESSION_SECRET: 's'.repeat(40),
  ENCRYPTION_KEY: 'e'.repeat(40),
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
});
