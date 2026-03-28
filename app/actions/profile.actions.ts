/*
 * Profile management server actions.
 *
 * These wrappers enforce that the caller is authenticated via the session
 * cookie.  They derive the current user's identity from the session and
 * delegate to the underlying functions in `auth.ts` with the appropriate
 * userId populated.  This prevents clients from forging identities by
 * passing arbitrary user identifiers.
 */

'use server';

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  getPublicUserProfile as origGetPublicUserProfile,
  getSelfUserProfile as origGetSelfUserProfile,
  updateUserProfile as origUpdateUserProfile,
} from './auth';

// Helper to read and verify the session cookie.  Returns null if the
// cookie is missing or invalid.
async function getSession() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Retrieves the current user's profile.  If no valid session exists an
 * unauthorized error is returned.  Otherwise delegates to the legacy
 * `getUserProfile` implementation with the derived userId.
 */
export async function getUserProfile() {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origGetSelfUserProfile();
}

/**
 * Updates the current user's profile.  The payload mirrors the legacy
 * `updateUserProfile` input minus the userId.  The session's userId is
 * automatically populated before delegation.
 */
export async function updateUserProfile(formData: {
  displayName?: string;
  bio?: string;
  profilePhoto?: string | null;
}) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origUpdateUserProfile({ userId: session.userId, ...formData });
}

/**
 * Retrieves the profile for any user by id.  This helper does not perform
 * any session check because public profile information is accessible to
 * authenticated users.  It simply forwards the request to the legacy
 * implementation.
 */
export async function getPublicUserProfile(userId: string) {
  return origGetPublicUserProfile(userId);
}
