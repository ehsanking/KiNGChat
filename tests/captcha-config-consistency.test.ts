import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('captcha provider consistency', () => {
  it('uses reCAPTCHA naming in env examples and removes turnstile keys', () => {
    const envExample = fs.readFileSync('.env.example', 'utf8');
    const prodEnvExample = fs.readFileSync('production.env.example', 'utf8');

    expect(envExample).toContain('RECAPTCHA_SITE_KEY');
    expect(envExample).toContain('RECAPTCHA_SECRET_KEY');
    expect(envExample).not.toContain('TURNSTILE_SITE_KEY');
    expect(envExample).not.toContain('TURNSTILE_SECRET_KEY');

    expect(prodEnvExample).toContain('RECAPTCHA_SITE_KEY');
    expect(prodEnvExample).toContain('RECAPTCHA_SECRET_KEY');
    expect(prodEnvExample).not.toContain('TURNSTILE_SITE_KEY');
    expect(prodEnvExample).not.toContain('TURNSTILE_SECRET_KEY');
  });
});
