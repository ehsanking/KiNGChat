import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLocalCaptchaChallenge, verifyLocalCaptchaChallenge } from '@/lib/local-captcha';

describe('local stateless captcha', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a local arithmetic challenge and verifies correct answers', () => {
    const challenge = createLocalCaptchaChallenge();
    const [left, right] = challenge.prompt
      .replace('= ?', '')
      .split('+')
      .map((part) => Number(part.trim()));

    expect(challenge.captchaId.startsWith('v2.')).toBe(true);
    expect(verifyLocalCaptchaChallenge(challenge.captchaId, String(left + right))).toBe(true);
  });

  it('rejects invalid and expired answers', () => {
    const challenge = createLocalCaptchaChallenge();

    expect(verifyLocalCaptchaChallenge(challenge.captchaId, '999')).toBe(false);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(verifyLocalCaptchaChallenge(challenge.captchaId, '10')).toBe(false);
  });
});
