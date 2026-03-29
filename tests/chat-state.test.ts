import { describe, expect, it } from 'vitest';

import {
  buildConversationId,
  buildDraftStorageKey,
  buildPendingQueueStorageKey,
  renderDeliveryLabel,
} from '@/app/chat/chat-state';

describe('chat state helpers', () => {
  it('builds deterministic dm and group conversation ids', () => {
    expect(buildConversationId('u1', 'u2', undefined)).toBe('dm:u1:u2');
    expect(buildConversationId('u1', 'u2', 'group-1')).toBe('group-1');
    expect(buildConversationId(undefined, 'u2', undefined)).toBe('');
  });

  it('builds storage keys for drafts and pending queue', () => {
    expect(buildDraftStorageKey('u1', 'u2', undefined)).toBe('elahe:draft:u1:dm:u1:u2');
    expect(buildDraftStorageKey('u1', undefined, 'g1')).toBe('elahe:draft:u1:g1');
    expect(buildPendingQueueStorageKey('u1')).toBe('elahe:pending:u1');
    expect(buildPendingQueueStorageKey(undefined)).toBe('');
  });

  it('renders delivery labels from delivery states', () => {
    expect(renderDeliveryLabel('QUEUED')).toBe('Queued');
    expect(renderDeliveryLabel('SENT')).toBe('Sent');
    expect(renderDeliveryLabel('DELIVERED')).toBe('Delivered');
    expect(renderDeliveryLabel('READ')).toBe('Read');
    expect(renderDeliveryLabel('FAILED')).toBe('Failed');
    expect(renderDeliveryLabel(undefined)).toBe('');
  });
});
