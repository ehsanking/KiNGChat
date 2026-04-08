'use server';

/**
 * @deprecated Legacy auth barrel.
 * Migration guide:
 * - New imports should use `auth.actions.ts`, `auth.2fa.actions.ts`, and `auth.recovery.actions.ts`.
 * - This file remains as a compatibility shim.
 */

export { registerUser, loginUser, getPublicSettings } from './auth.actions';
export { getRecoveryQuestion, recoverPassword } from './auth.recovery.actions';
export { validate2FALogin } from './auth.2fa.actions';
