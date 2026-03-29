import { NextResponse } from 'next/server';
import { clearSession, getSessionFromRequest } from '@/lib/session';
import { assertSameOrigin, validateCsrfToken } from '@/lib/request-security';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      numericId: true,
      role: true,
      badge: true,
      isVerified: true,
      totpEnabled: true,
      needsPasswordChange: true,
    },
  });

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user,
    csrfToken: session.csrfToken,
  });
}

export async function DELETE(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    assertSameOrigin(request);
    validateCsrfToken(request, session);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid logout request.' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  clearSession(response);
  return response;
}
