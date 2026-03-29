import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  process.env.SESSION_SECRET = 'x'.repeat(32);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session hardening', () => {
  it('rejects a session token when the user-agent hash does not match', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = createSessionToken(
      {
        userId: 'u1',
        role: 'USER',
        needsPasswordChange: false,
        sessionVersion: 1,
      },
      { userAgent: 'agent-a' },
    );

    expect(verifySessionToken(token, { userAgent: 'agent-a' })?.userId).toBe('u1');
    expect(verifySessionToken(token, { userAgent: 'agent-b' })).toBeNull();
  });
});
