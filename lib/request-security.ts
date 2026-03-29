import { getSessionFromRequest, type SessionData } from '@/lib/session';
import { getFreshSessionUser, isSessionFreshForUser } from '@/lib/session-auth';

const getConfiguredOrigins = () => {
  const configured = new Set<string>();

  if (process.env.APP_URL) configured.add(process.env.APP_URL);
  if (process.env.ALLOWED_ORIGINS) {
    for (const origin of process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)) {
      configured.add(origin);
    }
  }

  return configured;
};

export const assertSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    throw new Error('Missing origin or host header.');
  }

  const expectedOrigins = getConfiguredOrigins();
  if (expectedOrigins.size === 0) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    expectedOrigins.add(`${protocol}://${host}`);
  }

  if (!expectedOrigins.has(origin)) {
    throw new Error('Origin is not allowed.');
  }
};

export const requireAuthenticatedSession = (request: Request): SessionData => {
  const session = getSessionFromRequest(request);
  if (!session) {
    throw new Error('Authentication required.');
  }
  return session;
};

export const requireAuthenticatedSessionFresh = async (request: Request): Promise<SessionData> => {
  const session = requireAuthenticatedSession(request);
  const user = await getFreshSessionUser(session);
  if (!user || !isSessionFreshForUser(session, user)) {
    throw new Error('Authentication required.');
  }
  return session;
};

export const requireAdminSession = (request: Request): SessionData => {
  const session = requireAuthenticatedSession(request);
  if (session.role !== 'ADMIN') {
    throw new Error('Administrator privileges are required.');
  }
  return session;
};

export const requireAdminSessionFresh = async (request: Request): Promise<SessionData> => {
  const session = await requireAuthenticatedSessionFresh(request);
  if (session.role !== 'ADMIN') {
    throw new Error('Administrator privileges are required.');
  }
  return session;
};

export const validateCsrfToken = (request: Request, session: SessionData) => {
  const csrfToken = request.headers.get('x-csrf-token');
  if (!csrfToken || csrfToken !== session.csrfToken) {
    throw new Error('Invalid CSRF token.');
  }
};
