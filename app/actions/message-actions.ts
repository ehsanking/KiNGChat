'use server';

/**
 * @deprecated Legacy messaging barrel.
 * Migration guide:
 * - Import from `messaging.actions.ts`.
 */

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
