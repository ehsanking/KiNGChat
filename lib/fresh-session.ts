import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionFromCookieHeader, getSessionFromRequest } from '@/lib/session';

export type FreshAuthUser = {
  id: string;
  role: string;
  isApproved: boolean;
  isBanned: boolean;
  sessionVersion: number;
  needsPasswordChange: boolean;
};

const selectFields = {
  id: true,
  role: true,
  isApproved: true,
  isBanned: true,
  sessionVersion: true,
  needsPasswordChange: true,
} as const;

const loadFreshUser = async (session: { userId: string; role: string; sessionVersion: number }) => {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: selectFields });
  if (!user) return null;
  if (user.isBanned || !user.isApproved) return null;
  if (user.role !== session.role) return null;
  if (user.sessionVersion !== session.sessionVersion) return null;
  return user;
};

export async function requireFreshAuthenticatedUser(request: Request | NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return null;
  return loadFreshUser(session);
}

export async function requireFreshAdminUser(request: Request | NextRequest) {
  const user = await requireFreshAuthenticatedUser(request);
  if (!user || user.role !== 'ADMIN') return null;
  return user;
}

export async function requireFreshSocketSession(params: { cookieHeader?: string; userAgent?: string; ip?: string | null }) {
  const session = getSessionFromCookieHeader(params.cookieHeader, { userAgent: params.userAgent, ip: params.ip ?? undefined });
  if (!session) return null;
  const user = await loadFreshUser(session);
  if (!user) return null;
  return { session, user };
}
