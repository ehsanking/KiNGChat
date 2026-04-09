/**
 * Contacts management server actions.
 *
 * These actions enforce session‑based authorization for all contact
 * operations. Each function derives the current user's id from the
 * signed session cookie preventing impersonation.
 */

'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSessionFromCookies, asTrimmedString } from './auth.helpers';

/**
 * Returns the authenticated user's contacts.
 */
export async function getContacts() {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  const sanitizedOwnerId = session.userId;

  try {
    const contacts = await prisma.contact.findMany({
      where: { ownerId: sanitizedOwnerId },
      include: {
        contact: {
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
            identityKeyPublic: true,
            signedPreKey: true,
            signedPreKeySig: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      contacts: contacts.map((c: (typeof contacts)[number]) => c.contact),
    };
  } catch (error) {
    logger.error('Get contacts error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch contacts.' };
  }
}

/**
 * Adds a user to the caller's contact list.
 */
export async function addContact(contactId: string) {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  const sanitizedOwnerId = session.userId;
  const sanitizedContactId = asTrimmedString(contactId);

  if (!sanitizedOwnerId || !sanitizedContactId) {
    return { error: 'Both user IDs are required.' };
  }
  if (sanitizedOwnerId === sanitizedContactId) {
    return { error: 'You cannot add yourself as a contact.' };
  }

  try {
    const contactUser = await prisma.user.findUnique({
      where: { id: sanitizedContactId },
      select: { id: true, username: true, displayName: true, profilePhoto: true, numericId: true, badge: true, isVerified: true, role: true },
    });
    if (!contactUser) return { error: 'User not found.' };

    await prisma.contact.upsert({
      where: { ownerId_contactId: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId } },
      create: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId },
      update: {},
    });

    return { success: true, contact: contactUser };
  } catch (error) {
    logger.error('Add contact error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to add contact.' };
  }
}

/**
 * Removes a user from the caller's contact list.
 */
export async function removeContact(contactId: string) {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  const sanitizedOwnerId = session.userId;
  const sanitizedContactId = asTrimmedString(contactId);

  if (!sanitizedOwnerId || !sanitizedContactId) {
    return { error: 'Both user IDs are required.' };
  }

  try {
    await prisma.contact.deleteMany({
      where: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId },
    });
    return { success: true };
  } catch (error) {
    logger.error('Remove contact error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to remove contact.' };
  }
}
