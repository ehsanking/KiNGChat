/**
 * App actions barrel.
 *
 * Use this file for new imports to avoid coupling to legacy file names.
 */

export {
  getAllUsers,
  toggleBanUser,
  updateUserBadges,
  getAdminSettings,
  updateAdminSettings,
  getAuditLogs,
  exportSystemData,
  getAllReports,
  getReportActionHistory,
  resolveReport,
  addReportModeratorNote,
  applyModerationAction,
  getManagerKpis,
  getSystemOverview,
} from './admin.actions';

export { registerUser, loginUser, getPublicSettings, updateAdminCredentials } from './auth.actions';
export { setup2FA, verify2FA, disable2FA, validate2FALogin } from './auth.2fa.actions';
export { getRecoveryQuestion, recoverPassword } from './auth.recovery.actions';

export { getUserProfile, getSelfUserProfile, getPublicUserProfile, updateUserProfile } from './profile.actions';
export { getContacts, addContact, removeContact } from './contacts.actions';
export {
  getUserCommunities,
  createCommunity,
  joinGroupByInvite,
  addMemberToGroup,
  removeMemberFromGroup,
  getGroupMembers,
  leaveGroup,
} from './groups.actions';
export {
  getMessageHistory,
  syncConversationState,
  markConversationDelivered,
  reactToMessage,
  editConversationMessage,
  saveConversationDraft,
  listConversationDrafts,
  deleteConversationDraft,
  searchConversationMessages,
} from './messaging.actions';
export { getUserPublicKeys, getRecipientE2eeStatus } from './keys.actions';
export { searchUsers } from './search.actions';
