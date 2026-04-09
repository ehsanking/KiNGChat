import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bot: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

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
