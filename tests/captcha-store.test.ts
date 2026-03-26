import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCaptchaChallengeResilient, verifyCaptchaChallengeResilient } from '@/lib/captcha-store';

describe('captcha-store resilient fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
    process.env.CAPTCHA_SECRET = '1234567890abcdef1234567890abcdef';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('creates a stateless captcha challenge that verifies across calls', async () => {
    const captchaId = await createCaptchaChallengeResilient('AbC12');
    expect(captchaId.startsWith('v1.')).toBe(true);

    const firstTry = await verifyCaptchaChallengeResilient(captchaId, 'abc12');
    expect(firstTry).toBe(true);

    const secondTry = await verifyCaptchaChallengeResilient(captchaId, 'abc12');
    expect(secondTry).toBe(true);
  });

  it('rejects expired stateless captcha challenges', async () => {
    const captchaId = await createCaptchaChallengeResilient('HELLO');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const isValid = await verifyCaptchaChallengeResilient(captchaId, 'HELLO');

    expect(isValid).toBe(false);
  });
});
