import { NextResponse } from 'next/server';
import { loginUser } from '@/app/actions/auth';
import { assertSameOrigin } from '@/lib/request-security';
import { issueSession } from '@/lib/session';

/**
 * Handles the login request. This endpoint accepts JSON with
 * username, password and optional captchaId/captchaAnswer fields.
 * It authenticates the user via the existing `loginUser` action
 * and, on success, issues a signed session cookie.
 *
 * This endpoint does not rely on any temporary routes.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const body = await request.json();
    const result = await loginUser({
      username: typeof body?.username === 'string' ? body.username : '',
      password: typeof body?.password === 'string' ? body.password : '',
      captchaId: typeof body?.captchaId === 'string' ? body.captchaId : '',
      captchaAnswer: typeof body?.captchaAnswer === 'string' ? body.captchaAnswer : '',
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    if ('requires2FA' in result && result.requires2FA) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: result.userId,
      });
    }

    if (
      !('userId' in result) ||
      !('username' in result) ||
      !('numericId' in result) ||
      !('role' in result)
    ) {
      return NextResponse.json({ error: 'Invalid login response.' }, { status: 500 });
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
    });

    issueSession(response, {
      userId: result.userId!,
      username: result.username!,
      numericId: result.numericId!,
      role: result.role!,
      badge: result.badge ?? null,
      isVerified: Boolean(result.isVerified),
      needsPasswordChange: Boolean(result.needsPasswordChange),
    }, {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed.' },
      { status: 500 },
    );
  }
}
