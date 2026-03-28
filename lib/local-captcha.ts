import crypto from 'node:crypto';

const CAPTCHA_VERSION = 'v2';
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

const getSecret = () => {
  const secret = process.env.LOCAL_CAPTCHA_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET;
  return secret && secret.trim().length > 0 ? secret : 'local-captcha-dev-secret';
};

const signPayload = (payload: string) => crypto
  .createHmac('sha256', getSecret())
  .update(payload)
  .digest('base64url');

export const createLocalCaptchaChallenge = () => {
  const left = crypto.randomInt(1, 10);
  const right = crypto.randomInt(1, 10);
  const answer = String(left + right);
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(8).toString('base64url');
  const payload = `${issuedAt}.${nonce}.${answer}`;
  const signature = signPayload(payload);

  return {
    prompt: `${left} + ${right} = ?`,
    captchaId: `${CAPTCHA_VERSION}.${payload}.${signature}`,
  };
};

export const verifyLocalCaptchaChallenge = (captchaId: string, answer: string) => {
  if (!captchaId || !answer) return false;

  const parts = captchaId.split('.');
  if (parts.length !== 5) return false;

  const [version, issuedAtRaw, nonce, expectedAnswer, signature] = parts;
  if (version !== CAPTCHA_VERSION || !issuedAtRaw || !nonce || !expectedAnswer || !signature) {
    return false;
  }

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;

  if (Date.now() - issuedAt > CAPTCHA_TTL_MS) return false;

  const payload = `${issuedAt}.${nonce}.${expectedAnswer}`;
  const expectedSignature = signPayload(payload);

  if (signature.length !== expectedSignature.length) return false;

  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  if (!isSignatureValid) return false;

  return answer.trim() === expectedAnswer;
};
