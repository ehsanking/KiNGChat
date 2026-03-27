import { logger } from '@/lib/logger';

const TURNSTILE_VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const isTurnstileConfigured = () =>
  Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstileToken(token: string, remoteIp?: string | null) {
  if (!isTurnstileConfigured()) {
    logger.warn('Turnstile is not configured. Captcha validation is bypassed.');
    return { success: true, reason: 'turnstile_not_configured' as const };
  }

  if (!token) {
    return { success: false, reason: 'missing_token' as const };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY!;
  const formData = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) formData.append('remoteip', remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      cache: 'no-store',
    });

    if (!response.ok) {
      logger.warn('Turnstile verification request failed.', { status: response.status });
      return { success: false, reason: 'verification_http_error' as const };
    }

    const payload = await response.json() as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (!payload.success) {
      logger.warn('Turnstile verification rejected token.', {
        errorCodes: payload['error-codes'] ?? [],
      });
      return { success: false, reason: 'verification_rejected' as const };
    }

    return { success: true, reason: 'ok' as const };
  } catch (error) {
    logger.error('Turnstile verification failed with network/runtime error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, reason: 'verification_exception' as const };
  }
}
