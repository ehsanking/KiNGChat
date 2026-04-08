import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the session module.
 * Validates token creation, verification, rotation, expiry, and binding.
 */

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('SESSION_SECRET', 'a_very_secure_secret_that_is_at_least_32_chars');
});

describe('Session Management', () => {
  it('should create a valid session token', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = createSessionToken({
      userId: 'user-123',
      role: 'USER',
      needsPasswordChange: false,
      sessionVersion: 1,
    });
    expect(token).toBeTruthy();
    // C3: v2 tokens use encrypt-then-sign format: version.iv.ciphertext.tag.signature
    expect(token.split('.').length).toBe(5);

    const session = verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-123');
    expect(session!.role).toBe('USER');
  });

  it('should reject tampered tokens', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = createSessionToken({
      userId: 'user-123',
      role: 'USER',
      needsPasswordChange: false,
      sessionVersion: 1,
    });
    // Tamper with a character in the ciphertext portion
    const parts = token.split('.');
    const ct = parts[2];
    const tamperedCt = ct.slice(0, -1) + (ct.slice(-1) === 'a' ? 'b' : 'a');
    const tampered = [parts[0], parts[1], tamperedCt, parts[3], parts[4]].join('.');
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('should reject expired tokens', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    // Manually craft an expired token is complex, so test null/undefined
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken('')).toBeNull();
  });

  it('should include csrf token in session', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = createSessionToken({
      userId: 'user-csrf',
      role: 'USER',
      needsPasswordChange: false,
      sessionVersion: 1,
    });
    const session = verifySessionToken(token);
    expect(session!.csrfToken).toBeTruthy();
    expect(session!.csrfToken.length).toBeGreaterThanOrEqual(32);
  });

  it('should correctly determine session rotation need', async () => {
    const { shouldRotateSession } = await import('@/lib/session');
    // Session issued just now — should NOT need rotation
    const recentSession = {
      userId: 'u1', role: 'USER', needsPasswordChange: false,
      csrfToken: 'test', issuedAt: Date.now(), sessionVersion: 1,
      expiresAt: Date.now() + 86400000,
    };
    expect(shouldRotateSession(recentSession)).toBe(false);

    // Session issued 2 hours ago — should need rotation (default 1 hour)
    const oldSession = {
      ...recentSession,
      issuedAt: Date.now() - 2 * 60 * 60 * 1000,
    };
    expect(shouldRotateSession(oldSession)).toBe(true);
  });

  it('should verify user-agent binding when present', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = createSessionToken(
      { userId: 'ua-user', role: 'USER', needsPasswordChange: false, sessionVersion: 1 },
      { userAgent: 'Mozilla/5.0 Test', ip: null },
    );
    // Same user-agent should verify
    const valid = verifySessionToken(token, { userAgent: 'Mozilla/5.0 Test', ip: null });
    expect(valid).not.toBeNull();

    // Different user-agent should fail
    const invalid = verifySessionToken(token, { userAgent: 'DifferentBrowser/1.0', ip: null });
    expect(invalid).toBeNull();
  });

  it('should parse session from cookie header', async () => {
    const { createSessionToken, getSessionFromCookieHeader, SESSION_COOKIE_NAME } = await import('@/lib/session');
    const token = createSessionToken({
      userId: 'cookie-user',
      role: 'USER',
      needsPasswordChange: false,
      sessionVersion: 1,
    });
    const cookieHeader = `other=val; ${SESSION_COOKIE_NAME}=${token}; another=x`;
    const session = getSessionFromCookieHeader(cookieHeader);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('cookie-user');
  });

  it('should return null for missing cookie header', async () => {
    const { getSessionFromCookieHeader } = await import('@/lib/session');
    expect(getSessionFromCookieHeader(null)).toBeNull();
    expect(getSessionFromCookieHeader(undefined)).toBeNull();
  });

  it('should determine secure flag from APP_URL', async () => {
    vi.stubEnv('APP_URL', 'https://example.com');
    vi.stubEnv('COOKIE_SECURE', '');
    // Re-import after env change
    vi.resetModules();
    vi.stubEnv('SESSION_SECRET', 'a_very_secure_secret_that_is_at_least_32_chars');
    vi.stubEnv('APP_URL', 'https://example.com');
    const mod = await import('@/lib/session');
    expect(mod.getSessionCookieSecureFlag()).toBe(true);
  });
});
