import { describe, expect, it } from 'vitest';
import { routeBotCommand } from '@/lib/bot/bot-manager';

// This only validates command pre-processing behavior via null fallback.
describe('bot command routing', () => {
  it('returns null for non-command text', async () => {
    const result = await routeBotCommand({
      commandText: 'hello',
      conversationId: 'c1',
      senderId: 'u1',
    });
    expect(result).toBeNull();
  });
});
