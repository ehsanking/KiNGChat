import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('cache layer', () => {
  it('supports namespaced getOrSet', async () => {
    const { getOrSetCache } = await import('@/lib/cache');
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const first = await getOrSetCache('user-1', fetcher, { namespace: 'user-profile' });
    const second = await getOrSetCache('user-1', fetcher, { namespace: 'user-profile' });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
