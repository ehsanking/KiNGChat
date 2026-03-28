import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from '@/lib/env-security';

function randomHex(length: number) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

describe('installer env compatibility with production validation', () => {
  it('accepts installer-style generated admin credentials', () => {
    const adminUsername = `owner_${randomHex(8)}`;
    const adminPassword = `A${randomHex(8)}!b${randomHex(8)}9Z`;

    process.env = {
      ...process.env,
      APP_ENV: 'production',
      NODE_ENV: 'production',
      JWT_SECRET: randomHex(64),
      SESSION_SECRET: randomHex(64),
      ENCRYPTION_KEY: randomHex(64),
      ADMIN_PASSWORD: adminPassword,
      ADMIN_USERNAME: adminUsername,
      POSTGRES_PASSWORD: `P${randomHex(16)}!x${randomHex(8)}`,
      DATABASE_URL: 'postgresql://user:strongpass@db:5432/elahe',
      APP_URL: 'https://chat.example.com',
      ALLOWED_ORIGINS: 'https://chat.example.com',
      POSTGRES_USER: 'user',
      POSTGRES_DB: 'elahe',
    };

    expect(() => validateProductionEnvironment()).not.toThrow();
  });
});
