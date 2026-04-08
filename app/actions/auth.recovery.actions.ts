'use server';

/**
 * Canonical password recovery actions.
 *
 * Migration guide:
 * - Prefer importing from `@/app/actions/auth.recovery.actions`.
 * - Legacy shims: `auth-session.actions.ts`, `auth-actions.ts`, `auth.ts`.
 */

export { getRecoveryQuestion, recoverPassword } from './auth-legacy';
