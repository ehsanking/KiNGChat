'use server';

/**
 * Canonical authentication actions.
 *
 * Scope: login/register/sessionless auth entry points and public auth settings.
 *
 * Migration guide:
 * - Prefer importing from `@/app/actions/auth.actions`.
 * - Legacy shims: `auth.ts`, `auth-actions.ts`, `auth.login.ts`, `auth.register.ts`.
 */

export { registerUser } from './auth.register';
export { loginUser } from './auth.login';
export { getPublicSettings } from './auth-legacy';
