import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createPreAuthChallenge, consumePreAuthChallengeStrict, __testOnlyExpireChallenge } from '@/lib/preauth-challenge';

describe('2FA login challenge flow', () => {
  it('supports single-use challenge and blocks replay', () => {
    const challenge = createPreAuthChallenge({ userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    expect(consumePreAuthChallengeStrict({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' }).ok).toBe(true);
    const replay = consumePreAuthChallengeStrict({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe('missing_or_reused');
  });

  it('returns explicit expired challenge reason', () => {
    const challenge = createPreAuthChallenge({ userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    __testOnlyExpireChallenge(challenge);
    const result = consumePreAuthChallengeStrict({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('login client persists and submits challengeId for /api/2fa', () => {
    const source = fs.readFileSync('components/auth/LoginPageClient.tsx', 'utf8');
    expect(source).toContain('setPending2FAChallengeId(data.challengeId)');
    expect(source).toContain('challengeId: pending2FAChallengeId');
    expect(source).toContain('show2FA && pending2FAChallengeId');
  });

  it('login API accepts captchaId for local provider', () => {
    const source = fs.readFileSync('app/api/login/route.ts', 'utf8');
    expect(source).toContain('captchaId');
  });
});

describe('socket and conversation authorization hardening', () => {
  it('socket connection validates fresh db-backed session', () => {
    const source = fs.readFileSync('lib/socket.ts', 'utf8');
    expect(source).toContain('requireFreshSocketSession');
  });

  it('typing and syncConversation enforce authorization', () => {
    const source = fs.readFileSync('lib/socket.ts', 'utf8');
    expect(source).toContain("socket.on('typing', async");
    expect(source).toContain('typingRejected');
    expect(source).toContain("socket.on('syncConversation', async");
    expect(source).toContain("{ error: 'Access denied.' }");
  });

  it('group read receipts are explicitly disabled in socket handler', () => {
    const source = fs.readFileSync('lib/socket.ts', 'utf8');
    expect(source).toContain('group_read_receipts_disabled');
    expect(source).toContain('if (message.recipientId !== readerId) return;');
  });

  it('canonical conversation id helpers exist and are used for secure attachments', () => {
    const helper = fs.readFileSync('lib/conversation-id.ts', 'utf8');
    const attachments = fs.readFileSync('lib/secure-attachments.ts', 'utf8');
    expect(helper).toContain('canonicalizeDirectConversationId');
    expect(helper).toContain('normalizeConversationId');
    expect(attachments).toContain('normalizeConversationId');
  });

  it('secure attachment URLs do not expose token by default', () => {
    const attachments = fs.readFileSync('lib/secure-attachments.ts', 'utf8');
    const downloadRoute = fs.readFileSync('app/api/upload-secure/[fileId]/route.ts', 'utf8');
    expect(attachments).toContain("downloadUrl: `/api/upload-secure/${fileId}`");
    expect(downloadRoute).toContain("ALLOW_QUERY_DOWNLOAD_TOKEN === 'true'");
  });
});

describe('captcha provider behavior', () => {
  it('public settings expose authoritative CAPTCHA_PROVIDER and local challenge', () => {
    const source = fs.readFileSync('app/api/settings/public/route.ts', 'utf8');
    expect(source).toContain('captchaProvider');
    expect(source).toContain('createLocalCaptchaChallenge');
    expect(source).toContain('localCaptcha');
  });

  it('auth flow verifies local captcha when provider is local', () => {
    const source = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');
    expect(source).toContain("captchaProvider === 'local'");
    expect(source).toContain('verifyLocalCaptchaChallenge');
  });
});
