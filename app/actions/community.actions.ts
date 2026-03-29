/*
 * Community and group management server actions.
 *
 * This module wraps group/channel/Community operations with a session check.
 * Each function derives the caller's identity from the session cookie
 * and forwards the call to the corresponding implementation in
 * `auth.ts`.  Functions that do not depend on the caller's identity
 * (e.g. getGroupMembers) are forwarded directly.
 */

'use server';

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  getUserCommunities as origGetUserCommunities,
  createCommunity as origCreateCommunity,
  joinGroupByInvite as origJoinGroupByInvite,
  addMemberToGroup as origAddMemberToGroup,
  removeMemberFromGroup as origRemoveMemberFromGroup,
  getGroupMembers as origGetGroupMembers,
  leaveGroup as origLeaveGroup,
  getMessageHistory as origGetMessageHistory,
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
 * Returns the list of communities (groups/channels) the authenticated user
 * belongs to.  Requires a valid session.
 */
export async function getUserCommunities() {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origGetUserCommunities(session.userId);
}

/**
 * Creates a new community (group or channel) owned by the caller.  A
 * community can be public or private.  Requires a valid session.
 */
export async function createCommunity(
  name: string,
  type: 'GROUP' | 'CHANNEL',
  description?: string,
  isPublic?: boolean,
) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origCreateCommunity(session.userId, name, type, description, isPublic);
}

/**
 * Joins a group or channel via an invite link.  Requires a valid session.
 */
export async function joinGroupByInvite(inviteLink: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origJoinGroupByInvite(session.userId, inviteLink);
}

/**
 * Adds a new member to a group or channel.  The caller must have the
 * appropriate role (OWNER or ADMIN) within the group.  Requires a
 * valid session.
 */
export async function addMemberToGroup(groupId: string, targetUserId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origAddMemberToGroup(session.userId, groupId, targetUserId);
}

/**
 * Removes a member from a group or channel.  The caller must have
 * sufficient permissions (OWNER or ADMIN).  Requires a valid session.
 */
export async function removeMemberFromGroup(groupId: string, targetUserId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origRemoveMemberFromGroup(session.userId, groupId, targetUserId);
}

/**
 * Retrieves the list of members for the specified group or channel.  This
 * operation requires access checks. The requester must be an admin,
 * a group member, or the group must be public.
 */
export async function getGroupMembers(groupId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origGetGroupMembers(session.userId, groupId);
}

/**
 * Removes the authenticated user from the specified group or channel.  The
 * caller must not be the group owner.  Requires a valid session.
 */
export async function leaveGroup(groupId: string) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origLeaveGroup(session.userId, groupId);
}

/**
 * Retrieves message history for a 1‑to‑1 conversation or a group.  The
 * caller must specify either a recipientId (for direct messages) or a
 * groupId (for group/channel messages).  A valid session is required and
 * membership of the specified group is enforced by the underlying
 * implementation.
 */
export async function getMessageHistory(
  recipientId?: string,
  groupId?: string,
  cursor?: string,
  limit?: number,
) {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }
  return origGetMessageHistory(session.userId, recipientId, groupId, cursor, limit);
}
