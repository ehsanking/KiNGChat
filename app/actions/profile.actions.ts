/**
 * Profile management server actions.
 *
 * These actions enforce that the caller is authenticated via the session
 * cookie. They derive the current user's identity from the session to
 * prevent identity forgery.
 */

'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSessionFromCookies, asTrimmedString, internalActionError } from './auth.helpers';

type PrivateSelfProfile = {
  id: string;
  username: string;
  numericId: string;
  displayName: string | null;
  bio: string | null;
  profilePhoto: string | null;
  role: string;
  badge: string | null;
  isVerified: boolean;
  totpEnabled: boolean;
};

type PublicUserProfile = {
  id: string;
  username: string;
  numericId: string;
  displayName: string | null;
  bio: string | null;
  profilePhoto: string | null;
  role: string;
  badge: string | null;
  isVerified: boolean;
};

async function logAuditAction(
  action: string,
  adminId?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  try {
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    await prisma.auditLog.create({
      data: {
        action,
        adminId,
        targetId,
        details: details ? JSON.stringify(details) : null,
        ip,
      }
    });
  } catch (error) {
    logger.error('Failed to log audit action.', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Retrieves the current user's profile.
 */
export async function getUserProfile() {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true,
        totpEnabled: true,
      },
    });

    if (!user) {
      return { error: 'User not found.' };
    }

    return { success: true, user: user as PrivateSelfProfile };
  } catch (error) {
    logger.error('Get self profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch profile.' };
  }
}

/**
 * Alias for getUserProfile for compatibility.
 */
export async function getSelfUserProfile() {
  return getUserProfile();
}

/**
 * Updates the current user's profile.
 */
export async function updateUserProfile(formData: {
  displayName?: string;
  bio?: string;
  profilePhoto?: string | null;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  const userId = session.userId;

  const displayName = asTrimmedString(formData.displayName);
  const bio = asTrimmedString(formData.bio);
  const profilePhoto =
    typeof formData.profilePhoto === 'string' ? formData.profilePhoto.trim() : formData.profilePhoto;

  if (displayName && displayName.length > 50) {
    return { error: 'Display name must be 50 characters or less.' };
  }

  if (bio && bio.length > 160) {
    return { error: 'Bio must be 160 characters or less.' };
  }

  if (typeof profilePhoto === 'string') {
    const base64Payload = profilePhoto.includes(',') ? profilePhoto.split(',')[1] ?? '' : profilePhoto;
    const estimatedBytes = Math.ceil((base64Payload.length * 3) / 4);
    const maxProfilePhotoBytes = 5 * 1024 * 1024;
    if (estimatedBytes > maxProfilePhotoBytes) {
      return { error: 'Profile photo size must be 5MB or less.' };
    }
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existingUser) {
      return { error: 'User not found.' };
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: displayName || null,
        bio: bio || null,
        profilePhoto: profilePhoto ?? null,
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
        isVerified: true,
      },
    });

    await logAuditAction('PROFILE_UPDATED', userId, userId, {
      hasDisplayName: Boolean(displayName),
      hasBio: Boolean(bio),
      hasProfilePhoto: Boolean(profilePhoto),
    });

    return { success: true, user: updatedUser };
  } catch (error) {
    logger.error('Update profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalActionError('profile update');
  }
}

/**
 * Retrieves the public profile for any user by id.
 */
export async function getPublicUserProfile(userId: string) {
  const sanitizedUserId = asTrimmedString(userId);
  if (!sanitizedUserId) {
    return { error: 'User id is required.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: sanitizedUserId },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true,
      },
    });

    if (!user) {
      return { error: 'User not found.' };
    }

    return { success: true, user: user as PublicUserProfile };
  } catch (error) {
    logger.error('Get profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch profile.' };
  }
}
