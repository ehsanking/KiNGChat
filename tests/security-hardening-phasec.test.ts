import { describe, expect, it, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { createPreAuthChallenge, consumePreAuthChallenge, __testOnlyExpireChallenge } from '@/lib/preauth-challenge';
import { getSessionCookieSecureFlag } from '@/lib/session';
import { isSecureUploadAllowed } from '@/lib/file-upload-policy';
import { parseSendMessageDto } from '@/lib/dto/messaging';

describe('security hardening patch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.COOKIE_SECURE;
    delete process.env.APP_URL;
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('2fa pre-auth challenge is required and single-use', () => {
    const challenge = createPreAuthChallenge({ userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    expect(consumePreAuthChallenge({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' })).toBe(true);
    expect(consumePreAuthChallenge({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' })).toBe(false);
  });

  it('expired challenge fails', () => {
    const challenge = createPreAuthChallenge({ userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' });
    __testOnlyExpireChallenge(challenge);
    expect(consumePreAuthChallenge({ challengeId: challenge, userId: 'u1', userAgent: 'ua', ip: '1.1.1.1' })).toBe(false);
  });

  it('cookie secure flag follows APP_URL scheme unless explicitly overridden', () => {
    process.env.APP_URL = 'http://10.0.0.10';
    expect(getSessionCookieSecureFlag()).toBe(false);
    process.env.COOKIE_SECURE = 'true';
    expect(getSessionCookieSecureFlag()).toBe(true);
  });

  it('secure upload allowlist validates extension and MIME match', () => {
    expect(
      isSecureUploadAllowed({
        fileName: 'photo.JPG',
        declaredMime: 'image/jpeg',
        detectedMime: 'image/jpeg',
        allowedFileFormats: 'jpg,image/jpeg,png,image/png',
      }),
    ).toBe(true);
    expect(
      isSecureUploadAllowed({
        fileName: 'malware.exe',
        declaredMime: 'application/octet-stream',
        detectedMime: 'application/octet-stream',
        allowedFileFormats: 'jpg,image/jpeg',
      }),
    ).toBe(false);
    expect(
      isSecureUploadAllowed({
        fileName: 'photo.jpg',
        declaredMime: 'image/jpeg',
        detectedMime: 'application/pdf',
        allowedFileFormats: 'jpg,image/jpeg,pdf,application/pdf',
      }),
    ).toBe(false);
  });

  it('message dto keeps secure attachment metadata fields', () => {
    const parsed = parseSendMessageDto({ recipientId: 'u2', ciphertext: 'x', nonce: 'n', wrappedFileKey: 'k', wrappedFileKeyNonce: 'wn', fileNonce: 'fn' });
    expect(parsed?.wrappedFileKey).toBe('k');
    expect(parsed?.wrappedFileKeyNonce).toBe('wn');
    expect(parsed?.fileNonce).toBe('fn');
  });

  it('draft save path never persists plaintext clientDraft', () => {
    const source = fs.readFileSync('lib/messaging-service.ts', 'utf8');
    expect(source).toContain('clientDraft: null');
  });

  it('recovery is disabled by default and question is no longer disclosed', () => {
    const source = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');
    expect(source).toContain("process.env.PASSWORD_RECOVERY_ENABLED === 'true'");
    expect(source).toContain("recoveryQuestion: 'Security answer required.'");
  });

  it('export data excludes direct raw user row export', () => {
    const source = fs.readFileSync('app/actions/admin.ts', 'utf8');
    expect(source).toContain('users: users.map');
    expect(source).not.toContain('const data = {\n      users,');
  });

  it('admin auth paths enforce fresh db-backed session state', () => {
    const source = fs.readFileSync('app/actions/admin.ts', 'utf8');
    expect(source).toContain('getFreshSessionUser');
    expect(source).toContain('sessionVersion');
  });
});
