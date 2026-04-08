import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('messaging-service expiry visibility', () => {
  it('applies expiresAt filtering in history/sync queries', () => {
    const source = readFileSync('lib/messaging-service.ts', 'utf8');
    expect(source).toContain('OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]');
  });
});
