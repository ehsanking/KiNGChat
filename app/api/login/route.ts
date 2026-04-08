import { NextResponse } from 'next/server';
import { loginUser } from '@/app/actions/auth.actions';
import { assertSameOrigin } from '@/lib/request-security';
import { issueSession } from '@/lib/session';
import { getRequestIdForRequest, respondWithInternalError, respondWithSafeError } from '@/lib/http-errors';
import { getRateLimitHeaders, rateLimit, rateLimitPreset } from '@/lib/rate-limit';
import { observeHistogram } from '@/lib/observability';

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
    const rateResult = await rateLimit(`login:${ip}`, rateLimitPreset('login'));
    const rateHeaders = getRateLimitHeaders(rateResult);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: rateHeaders },
      );
    }

    const body = await request.json();
    const result = await loginUser({
      username: typeof body?.username === 'string' ? body.username : '',
      password: typeof body?.password === 'string' ? body.password : '',
      captchaToken: typeof body?.captchaToken === 'string' ? body.captchaToken : '',
      captchaId: typeof body?.captchaId === 'string' ? body.captchaId : '',
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
