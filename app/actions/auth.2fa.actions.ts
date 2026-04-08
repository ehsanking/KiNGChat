'use server';

/**
 * Canonical two-factor authentication actions.
 *
 * Migration guide:
 * - Prefer importing from `@/app/actions/auth.2fa.actions`.
 * - Legacy shims: `auth.2fa.ts`, `twofa-actions.ts`, `security-2fa.actions.ts`.
 */

export { setup2FA, verify2FA, disable2FA, validate2FALogin } from './security-2fa.actions';
