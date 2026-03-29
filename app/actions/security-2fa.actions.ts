/*
 * Two‑factor authentication (TOTP) server actions.
 *
 * These wrappers enforce that the caller is authenticated for actions
 * manipulating the caller's 2FA settings (setup, verify, disable).  The
 * validate2FALogin action remains sessionless because it is invoked
 * during the login process before a session is established.  See
 * `auth.ts` for the underlying implementations.
 */

'use server';

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  setup2FA as origSetup2FA,
  verify2FA as origVerify2FA,
  disable2FA as origDisable2FA,
  validate2FALogin,
} from './auth-legacy';

async function getSession() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Initiates 2FA setup for the current user.  Returns the QR code and
 * secret needed to enrol in a TOTP authenticator.  Requires a valid
 * session.
 */
export async function setup2FA() {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origSetup2FA(session.userId);
}

/**
 * Verifies a TOTP token for the current user and enables 2FA if
 * successful.  Requires a valid session.
 */
export async function verify2FA(token: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origVerify2FA(session.userId, token);
}

/**
 * Disables 2FA for the current user after validating the provided TOTP
 * token.  Requires a valid session.
 */
export async function disable2FA(token: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origDisable2FA(session.userId, token);
}

// Re‑export validate2FALogin directly from auth.  This function must
// accept a userId because it is called prior to session creation during
// the login flow.
export { validate2FALogin };