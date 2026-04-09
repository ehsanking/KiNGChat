import { NextResponse } from 'next/server';
import { loginUser } from '@/app/actions/auth.actions';
import { assertSameOrigin } from '@/lib/request-security';
import { issueSession } from '@/lib/session';
import { getRequestIdForRequest, respondWithInternalError, respondWithSafeError } from '@/lib/http-errors';
import { getRateLimitHeaders, rateLimit, rateLimitPreset } from '@/lib/rate-limit';
import { observeHistogram } from '@/lib/observability';
import { loginSchema } from '@/lib/validation/auth';
import { toValidationErrorResponse, validateBody } from '@/lib/validation/middleware';

/**
 * Handles the login request. This endpoint accepts JSON with
 * username and password fields.
 * It authenticates the user via the existing `loginUser` action
 * and, on success, issues a signed session cookie.
 *
 * This endpoint does not rely on any temporary routes.
 */
export async function POST(request: Request) {
  const requestId = getRequestIdForRequest(request);
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const loginPreset = rateLimitPreset('login');
    const rateResult = await rateLimit(`login:${ip}`, loginPreset);
    const rateHeaders = getRateLimitHeaders(rateResult, loginPreset.max);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: rateHeaders },
      );
    }

    const body = await request.json();
    const validation = validateBody(loginSchema, body);
    if (!validation.success) {
      return NextResponse.json(toValidationErrorResponse(validation), { status: 400, headers: rateHeaders });
    }

    const result = await loginUser({
      username: validation.data.username,
      password: validation.data.password,
      captchaToken: validation.data.captchaToken ?? validation.data.localCaptchaToken ?? '',
      captchaId: validation.data.captchaId ?? validation.data.localCaptchaAnswer ?? '',
    });

    if (result.error) {
      return respondWithSafeError({
        status: 401,
        message: result.error,
        code: 'REQUEST_REJECTED',
        requestId,
      });
    }

    if ('requires2FA' in result && result.requires2FA) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: result.userId,
        challengeId: result.challengeId,
      }, { headers: rateHeaders });
    }

    if (
      !('userId' in result) ||
      !('username' in result) ||
      !('numericId' in result) ||
      !('role' in result)
    ) {
      return respondWithSafeError({
        status: 500,
        message: 'Invalid login response.',
        code: 'INTERNAL_ERROR',
        action: 'Retry login. If this persists, contact an administrator with the requestId.',
        requestId,
      });
    }

    const response = NextResponse.json({
      success: true,
      userId: result.userId,
      username: result.username,
      numericId: result.numericId,
      role: result.role,
      badge: result.badge,
      isVerified: result.isVerified,
      needsPasswordChange: result.needsPasswordChange,
    }, { headers: rateHeaders });

    issueSession(response, {
      userId: result.userId!,
      role: result.role!,
      needsPasswordChange: Boolean(result.needsPasswordChange),
      sessionVersion: result.sessionVersion!,
    }, {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
    });

    return response;
  } catch (error) {
    return respondWithInternalError('Login API', error, { requestId, action: 'Retry login shortly.' });
  } finally {
    observeHistogram('elahe_auth_login_duration_seconds', (performance.now() - startedAt) / 1000);
  }
}
