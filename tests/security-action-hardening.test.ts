import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('security action hardening', () => {
  const source = fs.readFileSync('app/actions/auth-legacy.ts', 'utf8');

  it('derives actor identity from session for sensitive actions', () => {
    expect(source).toContain('const requireAuthenticatedUser = async () =>');
    expect(source).toContain('const sanitizedOwnerId = auth.userId;');
    expect(source).toContain('return markMessagesDelivered(auth.userId');
    expect(source).toContain('const sanitizedAdminId = auth.userId;');
  });

  it('applies dedicated TOTP throttling and generic failures', () => {
    expect(source).toContain('rateLimit(`2fa:verify:');
    expect(source).toContain('rateLimit(`2fa:disable:');
    expect(source).toContain('rateLimit(`2fa:login:');
    expect(source).toContain("return { error: 'Verification failed.' }");
    expect(source).toContain("'TOTP_LOGIN_FAILED'");
  });

  it('hardens user discovery against easy enumeration', () => {
    expect(source).toContain('sanitizedQuery.length < 3');
    expect(source).toContain('search-users:');
    expect(source).toContain('const numericQuery = /^\\d{6,12}$/');
  });
});

describe('socket delivery lifecycle', () => {

  it('guards messaging when sender E2EE enrollment is incomplete', () => {
    const socketSource = fs.readFileSync('lib/socket.ts', 'utf8');
    expect(socketSource).toContain('e2ee_not_enrolled');
    expect(socketSource).toContain('senderEnrolled');
  });
  it('does not mark direct messages delivered on emit', () => {
    const socketSource = fs.readFileSync('lib/socket.ts', 'utf8');
    const sendMessageBlock = socketSource.slice(
      socketSource.indexOf("socket.on('sendMessage'"),
      socketSource.indexOf("socket.on('messageRead'"),
    );
    expect(sendMessageBlock).not.toContain("deliveryStatus: 'DELIVERED'");
    expect(socketSource).toContain("socket.on('messagesDelivered'");
  });
});

describe('secure attachment signing secret', () => {
  it('requires dedicated DOWNLOAD_TOKEN_SECRET', () => {
    const attachmentSource = fs.readFileSync('lib/secure-attachments.ts', 'utf8');
    expect(attachmentSource).toContain('process.env.DOWNLOAD_TOKEN_SECRET');
    expect(attachmentSource).not.toContain('|| process.env.ENCRYPTION_KEY');
    expect(attachmentSource).not.toContain('|| process.env.JWT_SECRET');
  });
});
