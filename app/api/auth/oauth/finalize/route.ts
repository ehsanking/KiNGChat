import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { issueSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import type { OAuthBridgeToken } from '@/lib/oauth';

const authSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.SESSION_SECRET;

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: authSecret });
  const bridgeToken = token as OAuthBridgeToken | null;

  if (!bridgeToken?.localUserId) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth_session_missing', request.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: bridgeToken.localUserId },
    select: { id: true, role: true, sessionVersion: true, needsPasswordChange: true, username: true },
  });

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth_user_missing', request.url));
  }

  await prisma.auditLog.create({
    data: {
      adminId: null,
      targetId: user.id,
      action: bridgeToken.localOAuthIsNewUser ? 'OAUTH_LOGIN_NEW_USER' : 'OAUTH_LOGIN_SUCCESS',
      details: JSON.stringify({ userId: user.id, provider: bridgeToken.sub ?? 'oauth' }),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
    },
  });

  const destination = bridgeToken.localOAuthIsNewUser
    ? '/auth/onboarding?next=%2Fchat'
    : '/chat';

  const response = NextResponse.redirect(new URL(destination, request.url));
  issueSession(response, {
    userId: user.id,
    role: user.role,
    needsPasswordChange: user.needsPasswordChange,
    sessionVersion: user.sessionVersion,
  }, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
  });

  return response;
}
