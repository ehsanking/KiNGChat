'use server';

/**
 * Canonical group/community actions.
 *
 * This module enforces session-derived authorization for all group/community
 * operations and forwards business logic to the legacy hardened
 * implementations.
 */

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME, type SessionData } from '@/lib/session';
import {
  addMemberToGroup as origAddMemberToGroup,
  createCommunity as origCreateCommunity,
  getGroupMembers as origGetGroupMembers,
  getMessageHistory as origGetMessageHistory,
  getUserCommunities as origGetUserCommunities,
  joinGroupByInvite as origJoinGroupByInvite,
  leaveGroup as origLeaveGroup,
  removeMemberFromGroup as origRemoveMemberFromGroup,
} from './auth-legacy';

/**
 * Reads and verifies the caller session from the signed cookie.
 */
async function getSession(): Promise<SessionData | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

/**
 * Returns the communities the authenticated user belongs to.
 */
export async function getUserCommunities() {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origGetUserCommunities(session.userId);
}

/**
 * Creates a group/channel owned by the authenticated user.
 */
export async function createCommunity(
  name: string,
  type: 'GROUP' | 'CHANNEL',
  description?: string,
  isPublic?: boolean,
) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origCreateCommunity(session.userId, name, type, description, isPublic);
}

/**
 * Joins a community by invite link for the authenticated user.
 */
export async function joinGroupByInvite(inviteLink: string) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origJoinGroupByInvite(session.userId, inviteLink);
}

/**
 * Adds a member to a community using the authenticated caller permissions.
 */
export async function addMemberToGroup(groupId: string, targetUserId: string) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origAddMemberToGroup(session.userId, groupId, targetUserId);
}

/**
 * Removes a member from a community using the authenticated caller permissions.
 */
export async function removeMemberFromGroup(groupId: string, targetUserId: string) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origRemoveMemberFromGroup(session.userId, groupId, targetUserId);
}

/**
 * Lists members for a community if the caller is allowed to view it.
 */
export async function getGroupMembers(groupId: string) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origGetGroupMembers(session.userId, groupId);
}

/**
 * Leaves a community as the authenticated user.
 */
export async function leaveGroup(groupId: string) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origLeaveGroup(session.userId, groupId);
}

/**
 * Returns message history for direct/group conversations for the caller.
 */
export async function getMessageHistory(
  recipientId?: string,
  groupId?: string,
  cursor?: string,
  limit?: number,
) {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  return origGetMessageHistory(session.userId, recipientId, groupId, cursor, limit);
}
