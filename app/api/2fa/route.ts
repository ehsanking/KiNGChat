import { NextResponse } from 'next/server';
import { validate2FALogin } from '@/app/actions/auth.2fa.actions';
import { assertSameOrigin } from '@/lib/request-security';
import { issueSession } from '@/lib/session';
import { rateLimit, getRateLimitHeaders, rateLimitPreset } from '@/lib/rate-limit';

/**
 * Verifies the two-factor authentication token and issues a session cookie
 * upon successful verification.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const body = await request.json();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const userId = typeof body?.userId === 'string' ? body.userId : 'anonymous';

    // Rate limit 2FA verification attempts per IP and userId to mitigate brute force
    // attacks.  Limit to 5 attempts per five minutes.  A lockout response is
    // returned when the limit is exceeded.
    const rateResult = await rateLimit(`2fa:${ip}:${userId}`, rateLimitPreset('2fa'));
    const rateHeaders = getRateLimitHeaders(rateResult);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many 2FA verification attempts. Please try again later.' },
        { status: 429, headers: rateHeaders },
      );
    }

    const result = await validate2FALogin(
      typeof body?.userId === 'string' ? body.userId : '',
      typeof body?.token === 'string' ? body.token : '',
      typeof body?.challengeId === 'string' ? body.challengeId : '',
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 401, headers: rateHeaders });
    }

    const response = NextResponse.json(
      {
        success: true,
        userId: result.userId,
        username: result.username,
        numericId: result.numericId,
        role: result.role,
        badge: result.badge,
        isVerified: result.isVerified,
        needsPasswordChange: result.needsPasswordChange,
      },
      { headers: rateHeaders },
    );

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed.' },
      { status: 500 },
    );
  }
}
