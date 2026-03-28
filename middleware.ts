import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders } from '@/lib/security-headers';
import { getSessionFromCookieHeaderEdge } from '@/lib/session-edge';

const AUTH_ROUTES = ['/auth/login', '/auth/register'];
const SETUP_ADMIN_ROUTE = '/auth/setup-admin';
const CHAT_ROUTE = '/chat';
const LEGACY_CHAT_ROUTE = '/chat-v2';
const ADMIN_ROUTE = '/admin';

export async function middleware(request: NextRequest) {
  const session = await getSessionFromCookieHeaderEdge(request.headers.get('cookie'), {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
  });
  const { pathname } = request.nextUrl;

  if (pathname === LEGACY_CHAT_ROUTE || pathname.startsWith(`${LEGACY_CHAT_ROUTE}/`)) {
    const response = NextResponse.redirect(new URL(CHAT_ROUTE, request.url), 308);
    response.headers.set('x-request-id', request.headers.get('x-request-id') || crypto.randomUUID());
    response.headers.set('x-legacy-route-retired', 'chat-v2');
    applySecurityHeaders(response.headers);
    return response;
  }

  // If no session and user is trying to access chat or admin setup, redirect to login
  if (!session && (pathname === CHAT_ROUTE || pathname.startsWith(`${CHAT_ROUTE}/`) || pathname === SETUP_ADMIN_ROUTE)) {
    const loginUrl = new URL('/auth/login', request.url);
    if (pathname === CHAT_ROUTE || pathname.startsWith(`${CHAT_ROUTE}/`)) {
      loginUrl.searchParams.set('next', CHAT_ROUTE);
    }
    const response = NextResponse.redirect(loginUrl);
    applySecurityHeaders(response.headers);
    return response;
  }

  // If session exists but user needs to change password, enforce setup-admin page
  if (session?.needsPasswordChange && (pathname === CHAT_ROUTE || pathname === SETUP_ADMIN_ROUTE)) {
    const response = NextResponse.redirect(new URL(SETUP_ADMIN_ROUTE, request.url));
    applySecurityHeaders(response.headers);
    return response;
  }

  // If session exists and user visits auth routes, redirect to chat
  if (session && AUTH_ROUTES.includes(pathname) && !session.needsPasswordChange) {
    const response = NextResponse.redirect(new URL(CHAT_ROUTE, request.url));
    applySecurityHeaders(response.headers);
    return response;
  }

  // Protect all administrative routes.  If the request path begins with /admin and the user is not
  // authenticated or not an administrator, redirect them away.  Without this guard, pages under
  // /admin could expose audit logs, system metrics or sensitive settings to regular users.
  if (pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)) {
    if (!session) {
      const response = NextResponse.redirect(new URL('/auth/login', request.url));
      applySecurityHeaders(response.headers);
      return response;
    }
    if (session.role !== 'ADMIN') {
      const response = NextResponse.redirect(new URL('/', request.url));
      applySecurityHeaders(response.headers);
      return response;
    }
  }

  // Enforce CSRF protection on all state‑changing HTTP methods.  For POST, PUT, PATCH and DELETE
  // requests we require the origin header to match the configured APP_URL/ALLOWED_ORIGINS and
  // validate the X-CSRF-Token header against the session.  This is applied globally here so that
  // individual route handlers don’t need to duplicate these checks.  See lib/request-security.ts for
  // implementation details.
  const method = request.method?.toUpperCase() || 'GET';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    try {
      const origin = request.headers.get('origin');
      const host = request.headers.get('host');
      if (!origin || !host) {
        throw new Error('Missing origin or host header.');
      }

      const expectedOrigins = new Set<string>();
      if (process.env.APP_URL) expectedOrigins.add(process.env.APP_URL);
      if (process.env.ALLOWED_ORIGINS) {
        for (const configuredOrigin of process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)) {
          expectedOrigins.add(configuredOrigin);
        }
      }
      if (expectedOrigins.size === 0) {
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        expectedOrigins.add(`${protocol}://${host}`);
      }

      if (!expectedOrigins.has(origin)) {
        throw new Error('Origin is not allowed.');
      }

      if (session) {
        const csrfToken = request.headers.get('x-csrf-token');
        if (!csrfToken || csrfToken !== session.csrfToken) {
          throw new Error('Invalid CSRF token.');
        }
      }
    } catch {
      return new Response('Invalid CSRF token or origin', { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set('x-request-id', request.headers.get('x-request-id') || crypto.randomUUID());
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  // Apply the middleware to authentication routes, chat, legacy chat, admin pages and all API
  // endpoints.  Extending the matcher ensures that CSRF and session checks are enforced on
  // sensitive POST/PUT/DELETE requests within the API.  You can narrow this list if certain
  // routes should be public.
  matcher: [
    '/auth/login',
    '/auth/register',
    '/auth/setup-admin',
    '/chat',
    '/chat/:path*',
    '/chat-v2',
    '/chat-v2/:path*',
    '/admin',
    '/admin/:path*',
    '/api/:path*',
  ],
};
