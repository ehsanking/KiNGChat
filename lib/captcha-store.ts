import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/logger';
import { createCaptchaChallengeShared, verifyCaptchaChallengeShared } from '@/lib/captcha-store-shared';

type CaptchaRecord = {
  answer: string;
  expiresAt: number;
};

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const captchaStore = new Map<string, CaptchaRecord>();

const purgeExpiredCaptchas = () => {
  const now = Date.now();
  for (const [id, record] of captchaStore.entries()) {
    if (record.expiresAt <= now) {
      captchaStore.delete(id);
    }
  }
};

export const createCaptchaChallenge = (answer: string) => {
  purgeExpiredCaptchas();

  const id = randomUUID();
  captchaStore.set(id, {
    answer: answer.trim().toUpperCase(),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  return id;
};

export const verifyCaptchaChallenge = (captchaId: string, userAnswer: string) => {
  if (!captchaId || !userAnswer) return false;

  purgeExpiredCaptchas();

  const record = captchaStore.get(captchaId);
  if (!record) return false;

  // Always delete on first verification attempt (valid/invalid)
  captchaStore.delete(captchaId);

  return record.answer === userAnswer.trim().toUpperCase();
};

/**
 * Uses Redis-backed captcha storage when REDIS_URL is configured.
 * Falls back to in-memory storage if Redis is unavailable.
 */
export const createCaptchaChallengeResilient = async (answer: string) => {
  if (!process.env.REDIS_URL) {
    return createCaptchaChallenge(answer);
  }

  try {
    return await createCaptchaChallengeShared(answer);
  } catch (error) {
    logger.warn('Redis captcha store unavailable. Falling back to memory store.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createCaptchaChallenge(answer);
  }
};

/**
 * Verifies captcha against Redis when configured, and falls back to memory store.
 */
export const verifyCaptchaChallengeResilient = async (captchaId: string, userAnswer: string) => {
  if (!captchaId || !userAnswer) return false;

  if (!process.env.REDIS_URL) {
    return verifyCaptchaChallenge(captchaId, userAnswer);
  }

  try {
    return await verifyCaptchaChallengeShared(captchaId, userAnswer);
  } catch (error) {
    logger.warn('Redis captcha verification unavailable. Falling back to memory store.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return verifyCaptchaChallenge(captchaId, userAnswer);
  }
};
