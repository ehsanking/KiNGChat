import { describe, expect, it } from 'vitest';
import { validateBody } from '@/lib/validation/middleware';
import { loginSchema } from '@/lib/validation/auth';

describe('validation middleware', () => {
  it('returns success for valid input', () => {
    const result = validateBody(loginSchema, { username: 'user', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('returns structured validation failure', () => {
    const result = validateBody(loginSchema, { username: '', password: 'a' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Request validation failed.');
      expect(result.details.length).toBeGreaterThan(0);
    }
  });
});
