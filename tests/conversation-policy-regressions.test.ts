import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('shared conversation policy regressions', () => {
  it('defines action-scoped conversation policy in one module', () => {
    const source = fs.readFileSync('lib/conversation-access.ts', 'utf8');
    expect(source).toContain("type ConversationAction");
    expect(source).toContain("'conversation.read'");
    expect(source).toContain("'conversation.join'");
    expect(source).toContain("'message.send'");
    expect(source).toContain("'attachment.write'");
    expect(source).toContain('export async function authorizeConversationAction');
  });

  it('secure attachment flows use shared conversation action policy', () => {
    const source = fs.readFileSync('lib/secure-attachments.ts', 'utf8');
    expect(source).toContain("authorizeConversationAction(userId, { conversationId: normalizedConversationId }, 'attachment.write')");

    const downloadRoute = fs.readFileSync('app/api/upload-secure/[fileId]/route.ts', 'utf8');
    expect(downloadRoute).toContain("authorizeConversationAction(user.id, { conversationId }, 'conversation.read')");
  });
});
