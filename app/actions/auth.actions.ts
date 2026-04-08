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

import { loginUser as origLoginUser } from './auth.login';
import { registerUser as origRegisterUser } from './auth.register';
import { getPublicSettings as origGetPublicSettings, updateAdminCredentials as origUpdateAdminCredentials } from './auth-legacy';

export async function registerUser(...args: Parameters<typeof origRegisterUser>) {
  return origRegisterUser(...args);
}

export async function loginUser(...args: Parameters<typeof origLoginUser>) {
  return origLoginUser(...args);
}

export async function getPublicSettings(...args: Parameters<typeof origGetPublicSettings>) {
  return origGetPublicSettings(...args);
}

export async function updateAdminCredentials(...args: Parameters<typeof origUpdateAdminCredentials>) {
  return origUpdateAdminCredentials(...args);
}
