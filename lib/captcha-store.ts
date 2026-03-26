import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import { logger } from '@/lib/logger';
import { createCaptchaChallengeShared, verifyCaptchaChallengeShared } from '@/lib/captcha-store-shared';

type CaptchaRecord = {
  answer: string;
  expiresAt: number;
};

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const captchaStore = new Map<string, CaptchaRecord>();
const STATELESS_CAPTCHA_VERSION = 'v1';

const getCaptchaSecret = () => {
  const secret = process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error('CAPTCHA_SECRET, SESSION_SECRET, JWT_SECRET, or ENCRYPTION_KEY with at least 16 characters is required.');
  }
  return secret;
};

const signStatelessCaptchaPayload = (payload: string) =>
  crypto.createHmac('sha256', getCaptchaSecret()).update(payload).digest('hex');

const timingSafeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const createStatelessCaptchaChallenge = (answer: string) => {
  const normalizedAnswer = answer.trim().toUpperCase();
  const nonce = randomUUID();
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${nonce}:${expiresAt}:${normalizedAnswer}`;
  const signature = signStatelessCaptchaPayload(payload);
  return `${STATELESS_CAPTCHA_VERSION}.${nonce}.${expiresAt}.${signature}`;
};

const verifyStatelessCaptchaChallenge = (captchaId: string, userAnswer: string) => {
  const parts = captchaId.split('.');
  if (parts.length !== 4 || parts[0] !== STATELESS_CAPTCHA_VERSION) return false;
  const [, nonce, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const normalizedAnswer = userAnswer.trim().toUpperCase();
  const payload = `${nonce}:${expiresAt}:${normalizedAnswer}`;
  const expectedSignature = signStatelessCaptchaPayload(payload);
  return timingSafeEqual(expectedSignature, signature);
};

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
    return createStatelessCaptchaChallenge(answer);
  }

  try {
    return await createCaptchaChallengeShared(answer);
  } catch (error) {
    logger.warn('Redis captcha store unavailable. Falling back to memory store.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createStatelessCaptchaChallenge(answer);
  }
};

/**
 * Verifies captcha against Redis when configured, and falls back to memory store.
 */
export const verifyCaptchaChallengeResilient = async (captchaId: string, userAnswer: string) => {
  if (!captchaId || !userAnswer) return false;

  if (!process.env.REDIS_URL) {
    return verifyStatelessCaptchaChallenge(captchaId, userAnswer);
  }

  try {
    return await verifyCaptchaChallengeShared(captchaId, userAnswer);
  } catch (error) {
    logger.warn('Redis captcha verification unavailable. Falling back to memory store.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return verifyStatelessCaptchaChallenge(captchaId, userAnswer);
  }
};
