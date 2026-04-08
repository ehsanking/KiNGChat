import { describe, expect, it } from 'vitest';
import { formatSafetyNumber, generateSafetyNumber } from '@/lib/e2ee-safety-number';

describe('e2ee safety number generation', () => {
  it('is deterministic and order independent', async () => {
    const a = await generateSafetyNumber('alice-public-key', 'bob-public-key');
    const b = await generateSafetyNumber('bob-public-key', 'alice-public-key');

    expect(a.digits).toBe(b.digits);
    expect(a.grouped).toBe(b.grouped);
  });

  it('returns exactly 60 digits in 12 groups of 5', async () => {
    const result = await generateSafetyNumber('key-A', 'key-B');

    expect(result.digits).toMatch(/^\d{60}$/);
    expect(result.grouped.split(' ')).toHaveLength(12);
    expect(result.grouped).toMatch(/^(\d{5}\s){11}\d{5}$/);
  });

  it('formats existing digits into groups of 5', () => {
    const formatted = formatSafetyNumber('123451234512345123451234512345123451234512345123451234512345');
    expect(formatted).toBe('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345');
  });
});
