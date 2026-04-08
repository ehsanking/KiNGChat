'use server';

/**
 * @deprecated Legacy 2FA entrypoint.
 * Migration guide:
 * - Import from `auth.2fa.actions.ts`.
 */

export { setup2FA, verify2FA, disable2FA, validate2FALogin } from './auth.2fa.actions';
