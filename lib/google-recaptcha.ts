import { logger } from '@/lib/logger';

type VerifyRecaptchaInput = {
  token: string;
  secret: string;
  remoteIp?: string;
};

type RecaptchaResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

export async function verifyRecaptchaToken(input: VerifyRecaptchaInput) {
  const payload = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });

  if (input.remoteIp) {
    payload.set('remoteip', input.remoteIp);
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
      cache: 'no-store',
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as RecaptchaResponse;
    return data.success === true;
  } catch (error) {
    logger.warn('reCAPTCHA verification request failed.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
