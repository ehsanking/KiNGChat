import crypto from 'node:crypto';

const CAPTCHA_VERSION = 'v2';
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const PROCESS_LOCAL_SECRET = crypto.randomBytes(32).toString('hex');

const getCaptchaSecret = () => {
  const configured = process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  return configured && configured.length >= 16 ? configured : PROCESS_LOCAL_SECRET;
};

const sign = (payload: string) => crypto.createHmac('sha256', getCaptchaSecret()).update(payload).digest('hex');

const timingSafeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export type LocalCaptchaChallenge = {
  captchaId: string;
  prompt: string;
  expiresAt: number;
};

export function createLocalCaptchaChallenge(): LocalCaptchaChallenge {
  const left = crypto.randomInt(2, 20);
  const right = crypto.randomInt(2, 20);
  const answer = String(left + right);
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${nonce}:${expiresAt}:${answer}`;
  const signature = sign(payload);

  return {
    captchaId: `${CAPTCHA_VERSION}.${nonce}.${expiresAt}.${signature}`,
    prompt: `${left} + ${right} = ?`,
    expiresAt,
  };
}

export function verifyLocalCaptchaChallenge(captchaId: string, userAnswer: string): boolean {
  const normalizedAnswer = userAnswer.trim();
  if (!captchaId || !normalizedAnswer) return false;

  const parts = captchaId.split('.');
  if (parts.length !== 4 || parts[0] !== CAPTCHA_VERSION) return false;

  const [, nonce, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const payload = `${nonce}:${expiresAt}:${normalizedAnswer}`;
  const expectedSignature = sign(payload);

  return timingSafeEqual(expectedSignature, signature);
}
