/**
 * Unified action barrel file.
 *
 * Re-exports from the new session-safe, modular action files.
 * Legacy barrel files (auth-actions.ts, profile-actions.ts, contact-actions.ts,
 * community-actions.ts, message-actions.ts, twofa-actions.ts) are kept as
 * thin compatibility shims but all new imports should come through this file
 * or one of the focused index modules (e.g. auth.actions.ts, admin.actions.ts).
 */

// ── Authentication ────────────────────────────────────────────────
export { registerUser } from './auth.register';
export { loginUser, validate2FALogin } from './auth.login';
export { getRecoveryQuestion, recoverPassword, updateAdminCredentials, getPublicSettings } from './auth-legacy';

// ── Admin ────────────────────────────────────────────────────────
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
} from './admin';

// ── Profile ──────────────────────────────────────────────────────
export { getUserProfile, getPublicUserProfile, updateUserProfile } from './profile.actions';
export { getSelfUserProfile } from './profile.actions';
export { getUserPublicKeys } from './keys.actions';

// ── Contacts ─────────────────────────────────────────────────────
export { getContacts, addContact, removeContact } from './contacts.actions';
export { searchUsers } from './search.actions';

// ── Communities / Groups ─────────────────────────────────────────
export {
  getUserCommunities,
  createCommunity,
  joinGroupByInvite,
  addMemberToGroup,
  removeMemberFromGroup,
  getGroupMembers,
  leaveGroup,
} from './community.actions';

// ── Messaging ────────────────────────────────────────────────────
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

// ── Two-Factor Authentication ────────────────────────────────────
export { setup2FA, verify2FA, disable2FA } from './security-2fa.actions';
