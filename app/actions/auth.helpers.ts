/**
 * Shared helpers for authentication and authorization in server actions.
 * 
 * These utilities provide consistent session validation and user authentication
 * across all server action modules.
 */

'use server';

import { cookies, headers } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { getFreshSessionUser } from '@/lib/session-auth';
import { createRequestId } from '@/lib/observability';

/**
 * Reads the session token from the request cookies and verifies it.  If the cookie is
 * missing or invalid, null is returned.  This helper is intentionally tolerant to
 * exceptions because server actions must never throw due to malformed cookies.
 */
export const getSessionFromCookies = async () => {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(cookie, {
      userAgent: headerStore.get('user-agent'),
      ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
    });
  } catch {
    return null;
  }
};

export const AUTH_REQUIRED_ERROR = { error: 'Authentication required.' };

export const requireAuthenticatedUser = async () => {
  const session = await getSessionFromCookies();
  if (!session?.userId) return null;
  const user = await getFreshSessionUser(session);
  if (!user || user.role !== session.role) return null;
  return session;
};

export const requireAdminUser = async () => {
  const session = await requireAuthenticatedUser();
  if (!session || session.role !== 'ADMIN') return null;
  return session;
};

export const getClientIp = async () => {
  const headersList = await headers();
  return headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
};

export const asTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const internalActionError = (operation: string) => {
  const requestId = createRequestId();
  return {
    error: `Request failed during ${operation}. Retry once, then contact an administrator with requestId ${requestId}.`,
    errorCode: 'INTERNAL_ERROR' as const,
    requestId,
  };
};
