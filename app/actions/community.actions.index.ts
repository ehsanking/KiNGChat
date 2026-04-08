'use server';

/**
 * @deprecated Legacy community index.
 * Migration guide:
 * - Import from `groups.actions.ts`.
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
} from './groups.actions';
