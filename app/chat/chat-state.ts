import type { DeliveryState } from '@/lib/types';

export type PendingQueueItem = {
  tempId: string;
  recipientId?: string;
  groupId?: string;
  ciphertext: string;
  nonce: string;
  plaintext: string;
  type: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  keyGeneration?: number;
  messageIndex?: number;
  replyToId?: string;
  forwardedFrom?: string;
};

export const buildConversationId = (currentUserId?: string, recipientId?: string | null, groupId?: string | null) => {
  if (groupId) return groupId;
  if (currentUserId && recipientId) return `dm:${currentUserId}:${recipientId}`;
  return '';
};

export const buildDraftStorageKey = (currentUserId?: string, recipientId?: string | null, groupId?: string | null) => {
  const conversationId = buildConversationId(currentUserId, recipientId, groupId);
  return conversationId ? `elahe:draft:${currentUserId}:${conversationId}` : '';
};

export const buildPendingQueueStorageKey = (currentUserId?: string) => (currentUserId ? `elahe:pending:${currentUserId}` : '');

export const renderDeliveryLabel = (status?: DeliveryState) => {
  switch (status) {
    case 'QUEUED':
      return 'Queued';
    case 'SENT':
      return 'Sent';
    case 'DELIVERED':
      return 'Delivered';
    case 'READ':
      return 'Read';
    case 'FAILED':
      return 'Failed';
    default:
      return '';
  }
};
