/**
 * Public key retrieval server actions for E2EE.
 */

'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { asTrimmedString } from './auth.helpers';

/**
 * Get user E2EE keys (for establishing shared secret).
 */
export async function getUserPublicKeys(targetUserId: string) {
  const sanitizedId = asTrimmedString(targetUserId);
  if (!sanitizedId) return { error: 'User id is required.' };

  try {
    const user = await prisma.user.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        identityKeyPublic: true,
        signedPreKey: true,
        signedPreKeySig: true,
      },
    });

    if (!user) return { error: 'User not found.' };

    return { success: true, keys: user };
  } catch (error) {
    logger.error('Get public keys error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch keys.' };
  }
}
