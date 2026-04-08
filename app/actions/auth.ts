/**
 * @deprecated Legacy unified action barrel.
 * Migration guide:
 * - Prefer importing from `app/actions/index.ts` or the canonical domain files:
 *   `auth.actions.ts`, `auth.2fa.actions.ts`, `auth.recovery.actions.ts`,
 *   `profile.actions.ts`, `contacts.actions.ts`, `groups.actions.ts`,
 *   `messaging.actions.ts`, and `admin.actions.ts`.
 */

export * from './index';
export { updateAdminCredentials } from './auth-legacy';
