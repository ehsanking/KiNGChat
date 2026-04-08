/**
 * User search server action.
 */

'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { requireAuthenticatedUser, getClientIp, asTrimmedString } from './auth.helpers';

export async function searchUsers(query: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return { error: 'Authentication required.' };

  const sanitizedQuery = asTrimmedString(query);
  if (!sanitizedQuery || sanitizedQuery.length < 3) {
    return { success: true, users: [] };
  }

  const ip = await getClientIp();
  const limit = await rateLimit(`search-users:${auth.userId}:${ip}`, { windowMs: 60_000, max: 20 });
  if (!limit.allowed) {
    return { error: 'Please wait before searching again.' };
  }

  const numericQuery = /^\d{6,12}$/.test(sanitizedQuery) ? sanitizedQuery : null;

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: sanitizedQuery } },
          ...(numericQuery ? [{ numericId: numericQuery }] : []),
        ],
        isBanned: false
      },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true
      },
      take: 10
    });
    return { success: true, users };
  } catch (error) {
    logger.error('Search error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to search users' };
  }
}
