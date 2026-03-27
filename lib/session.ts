import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'elahe_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type SessionData = {
  userId: string;
  username: string;
  numericId: string;
  role: string;
  badge: string | null;
  isVerified: boolean;
  needsPasswordChange: boolean;
  csrfToken: string;
  issuedAt: number;
  sessionVersion: number;
  userAgentHash?: string | null;
  ipHash?: string | null;
  expiresAt: number;
};

type SessionUserLike = Omit<SessionData, 'csrfToken' | 'issuedAt' | 'sessionVersion' | 'expiresAt'>;

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET, JWT_SECRET, or ENCRYPTION_KEY with at least 32 characters is required.');
  }
  return secret;
};

const base64UrlEncode = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
};

const signPayload = (payload: string) =>
  base64UrlEncode(crypto.createHmac('sha256', getSessionSecret()).update(payload).digest());

const hashOptionalValue = (value: string | null | undefined) =>
  value ? crypto.createHash('sha256').update(value).digest('hex') : null;

export const createSessionToken = (user: SessionUserLike, requestContext?: { userAgent?: string | null; ip?: string | null }) => {
  const session: SessionData = {
    ...user,
    badge: user.badge ?? null,
    csrfToken: crypto.randomBytes(24).toString('hex'),
    issuedAt: Date.now(),
    sessionVersion: 2,
    userAgentHash: hashOptionalValue(requestContext?.userAgent),
    ipHash: process.env.SESSION_BIND_IP === 'true' ? hashOptionalValue(requestContext?.ip) : null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
};

export const verifySessionToken = (token: string | undefined | null, requestContext?: { userAgent?: string | null; ip?: string | null }): SessionData | null => {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as SessionData;
    if (!session.userId || session.expiresAt <= Date.now()) {
      return null;
    }
    if (session.userAgentHash && session.userAgentHash !== hashOptionalValue(requestContext?.userAgent)) {
      return null;
    }
    if (session.ipHash && session.ipHash !== hashOptionalValue(requestContext?.ip)) {
      return null;
    }
    if (!session.issuedAt) {
      session.issuedAt = Date.now();
    }
    if (!session.sessionVersion) {
      session.sessionVersion = 1;
    }
    return session;
  } catch {
    return null;
  }
};

const getCookieOptions = (expiresAt: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  expires: new Date(expiresAt),
});

export const issueSession = (response: NextResponse, user: SessionUserLike, requestContext?: { userAgent?: string | null; ip?: string | null }) => {
  const token = createSessionToken(user, requestContext);
  const session = verifySessionToken(token, requestContext);
  if (!session) throw new Error('Failed to create session.');
  response.cookies.set(SESSION_COOKIE_NAME, token, getCookieOptions(session.expiresAt));
  return session;
};

export const clearSession = (response: NextResponse) => {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
  });
};

export const getSessionFromCookieHeader = (cookieHeader: string | undefined | null, requestContext?: { userAgent?: string | null; ip?: string | null }) => {
  if (!cookieHeader) return null;
  const cookieValue = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  return verifySessionToken(cookieValue, requestContext);
};

export const getSessionFromRequest = (request: Request | NextRequest) => {
  const cookieHeader =
    'headers' in request && typeof request.headers?.get === 'function'
      ? request.headers.get('cookie')
      : null;
  const userAgent = request.headers.get('user-agent');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip');
  return getSessionFromCookieHeader(cookieHeader, { userAgent, ip });
};
