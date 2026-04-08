'use server';

/**
 * Canonical group/community actions.
 *
 * Migration guide:
 * - Prefer importing from `@/app/actions/groups.actions`.
 * - Legacy shims: `community.actions.ts`, `community-actions.ts`, `auth.groups.ts`.
 */

export {
  getUserCommunities,
  createCommunity,
  joinGroupByInvite,
  addMemberToGroup,
  removeMemberFromGroup,
  getGroupMembers,
  leaveGroup,
  getMessageHistory,
} from './community.actions';
