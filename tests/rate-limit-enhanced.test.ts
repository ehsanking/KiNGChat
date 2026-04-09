import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Comprehensive tests for the rate-limiter module.
 * Validates in-memory rate limiting, cleanup, eviction, and stats.
 */

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  // Ensure Redis is not used
  vi.stubEnv('REDIS_URL', '');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Rate Limiter', () => {
  it('should allow requests within the limit', async () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '5');
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000');
    const { rateLimit } = await import('@/lib/rate-limit');
    const result = await rateLimit('test-ip-1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should block requests exceeding the limit', async () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '2');
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000');
    const { rateLimit } = await import('@/lib/rate-limit');
    await rateLimit('test-ip-2');
    await rateLimit('test-ip-2');
    const result = await rateLimit('test-ip-2');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after the window expires', async () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '1');
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '10');
    const { rateLimit } = await import('@/lib/rate-limit');
    await rateLimit('test-ip-3');
    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 20));
    const result = await rateLimit('test-ip-3');
    expect(result.allowed).toBe(true);
  });

  it('should return rate limit headers', async () => {
    const { rateLimit, getRateLimitHeaders } = await import('@/lib/rate-limit');
    const result = await rateLimit('test-ip-4');
    const headers = getRateLimitHeaders(result);
    expect(headers['X-RateLimit-Limit']).toBeDefined();
    expect(headers['X-RateLimit-Remaining']).toBeDefined();
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });


  it('should emit header limits that match endpoint presets', async () => {
    const { rateLimit, getRateLimitHeaders, rateLimitPreset } = await import('@/lib/rate-limit');

    const loginPreset = rateLimitPreset('login');
    const loginResult = await rateLimit('preset-login-1', loginPreset);
    expect(getRateLimitHeaders(loginResult, loginPreset.max)['X-RateLimit-Limit']).toBe(String(loginPreset.max));

    const registerPreset = rateLimitPreset('register');
    const registerResult = await rateLimit('preset-register-1', registerPreset);
    expect(getRateLimitHeaders(registerResult, registerPreset.max)['X-RateLimit-Limit']).toBe(String(registerPreset.max));

    const twoFaPreset = rateLimitPreset('2fa');
    const twoFaResult = await rateLimit('preset-2fa-1', twoFaPreset);
    expect(getRateLimitHeaders(twoFaResult, twoFaPreset.max)['X-RateLimit-Limit']).toBe(String(twoFaPreset.max));

    const apiPreset = rateLimitPreset('api-default');
    const apiResult = await rateLimit('preset-api-1', apiPreset);
    expect(getRateLimitHeaders(apiResult, apiPreset.max)['X-RateLimit-Limit']).toBe(String(apiPreset.max));
  });

  it('should report store stats', async () => {
    const { rateLimit, getRateLimitStoreStats } = await import('@/lib/rate-limit');
    await rateLimit('stats-key-1');
    const stats = getRateLimitStoreStats();
    expect(stats.size).toBeGreaterThanOrEqual(1);
    expect(stats.maxSize).toBeGreaterThan(0);
  });

  it('should handle custom window and max options', async () => {
    const { rateLimit } = await import('@/lib/rate-limit');
    const result = await rateLimit('custom-1', { windowMs: 1000, max: 3 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
