/*
 * Contacts management server actions.
 *
 * These wrappers enforce session‑based authorization for all contact
 * operations.  Each function derives the current user's id from the
 * signed session cookie and passes it to the underlying implementation
 * contained in the legacy `auth.ts` module.  Clients call these
 * functions without specifying a userId, preventing impersonation.
 */

'use server';

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  getContacts as origGetContacts,
  addContact as origAddContact,
  removeContact as origRemoveContact,
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
 * Returns the authenticated user's contacts.  Requires a valid session.
 */
export async function getContacts() {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origGetContacts(session.userId);
}

/**
 * Adds a user to the caller's contact list.  `contactId` must be the id
 * of the user to add.  A valid session is required.
 */
export async function addContact(contactId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origAddContact(session.userId, contactId);
}

/**
 * Removes a user from the caller's contact list.  `contactId` identifies
 * the contact to remove.  A valid session is required.
 */
export async function removeContact(contactId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origRemoveContact(session.userId, contactId);
}