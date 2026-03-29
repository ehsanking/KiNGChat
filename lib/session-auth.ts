import { prisma } from '@/lib/prisma';
import type { SessionData } from '@/lib/session';

export const getFreshSessionUser = async (session: SessionData) => {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, isBanned: true, isApproved: true, sessionVersion: true, needsPasswordChange: true },
  });
  if (!user) return null;
  if (user.isBanned || !user.isApproved) return null;
  if (session.sessionVersion !== user.sessionVersion) return null;
  return user;
};

export const isSessionFreshForUser = (session: SessionData, user: { role: string; sessionVersion: number }) =>
  session.role === user.role && session.sessionVersion === user.sessionVersion;
