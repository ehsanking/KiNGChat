'use server';

/**
 * @deprecated Legacy community barrel.
 * Migration guide:
 * - Import from `groups.actions.ts` for group/community operations.
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
