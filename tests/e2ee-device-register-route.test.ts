import { describe, expect, it } from 'vitest';
import { normalizeOneTimePreKeys } from '@/lib/e2ee-utils';

describe('e2ee device register route prekey normalization', () => {
  it('deduplicates keyId and drops invalid entries', () => {
    const normalized = normalizeOneTimePreKeys([
      { keyId: 'k1', publicKey: 'p1' },
      { keyId: 'k1', publicKey: 'p1-duplicate' },
      { keyId: '   ', publicKey: 'p2' },
      { keyId: 'k3', publicKey: '' },
      { keyId: 'k4', publicKey: 'p4', expiresAt: 'not-a-date' },
      { keyId: ' k5 ', publicKey: ' p5 ', signature: ' sig ' },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({ keyId: 'k1', publicKey: 'p1', signature: null, expiresAt: null });
    expect(normalized[1]).toMatchObject({ keyId: 'k5', publicKey: 'p5', signature: 'sig' });
  });
});
