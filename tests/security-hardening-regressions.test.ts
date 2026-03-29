import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('security hardening regressions', () => {
  it('rejects missing Origin/Host in shared same-origin guard', () => {
    const source = fs.readFileSync('lib/request-security.ts', 'utf8');
    expect(source).toContain("if (!origin || !host)");
    expect(source).toContain("throw new Error('Missing origin or host header.')");
  });

  it('uses attachment metadata index instead of attachment directory scan', () => {
    const source = fs.readFileSync('lib/secure-attachments.ts', 'utf8');
    expect(source).toContain('attachment-index');
    expect(source).not.toContain('readdir(');
    expect(source).toContain('resolveSecureAttachmentPath');
  });

  it('accepts download token header and keeps token bound to conversation/user/file', () => {
    const routeSource = fs.readFileSync('app/api/upload-secure/[fileId]/route.ts', 'utf8');
    expect(routeSource).toContain("req.headers.get('x-download-token')");
    expect(routeSource).toContain('verifySecureDownloadToken(token, fileId, session.userId, conversationId)');
  });

  it('stores encrypted TOTP secrets and migrates plaintext on read', () => {
    const authSource = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');
    expect(authSource).toContain('data: { totpSecret: encryptSecret(secret.base32) }');
    expect(authSource).toContain('readTotpSecretWithMigration');

    const helperSource = fs.readFileSync('lib/secret-encryption.ts', 'utf8');
    expect(helperSource).toContain('aes-256-gcm');
    expect(helperSource).toContain('SECRET_ENCRYPTION_KEY');
  });

  it('session cookie payload no longer stores username/numericId/badge/isVerified', () => {
    const source = fs.readFileSync('lib/session.ts', 'utf8');
    expect(source).toContain('export type SessionData = {');
    expect(source).not.toContain('username: string;');
    expect(source).not.toContain('numericId: string;');
    expect(source).not.toContain('badge: string | null;');
    expect(source).not.toContain('isVerified: boolean;');
  });
});
