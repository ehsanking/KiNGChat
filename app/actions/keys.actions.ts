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

export async function getRecipientE2eeStatus(recipientId: string): Promise<{ enrolled: boolean; e2eeVersion: string }> {
  const sanitizedId = asTrimmedString(recipientId);
  if (!sanitizedId) return { enrolled: false, e2eeVersion: 'legacy' };

  try {
    const user = await prisma.user.findUnique({
      where: { id: sanitizedId },
      select: {
        identityKeyPublic: true,
        signedPreKey: true,
        e2eeVersion: true,
      },
    });

    if (!user) return { enrolled: false, e2eeVersion: 'legacy' };

    const enrolled = Boolean(user.identityKeyPublic.trim() && user.signedPreKey.trim());
    return { enrolled, e2eeVersion: user.e2eeVersion ?? 'legacy' };
  } catch (error) {
    logger.error('Get recipient E2EE status error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { enrolled: false, e2eeVersion: 'legacy' };
  }
}
