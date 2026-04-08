/*
 * Session-less authentication actions.
 *
 * This module exposes authentication-related server actions that do not
 * require an authenticated session. Next.js "use server" files only allow
 * async function exports, so we provide explicit async wrappers here instead
 * of using a re-export list.
 */

'use server';

import {
  registerUser as authRegisterUser,
  loginUser as authLoginUser,
  getRecoveryQuestion as authGetRecoveryQuestion,
  recoverPassword as authRecoverPassword,
  getPublicSettings as authGetPublicSettings,
  validate2FALogin as authValidate2FALogin,
} from './auth-legacy';
import { searchUsers as authSearchUsers } from './search.actions';
import { getUserPublicKeys as authGetUserPublicKeys } from './keys.actions';

export async function registerUser(...args: Parameters<typeof authRegisterUser>) {
  return authRegisterUser(...args);
}

export async function loginUser(...args: Parameters<typeof authLoginUser>) {
  return authLoginUser(...args);
}

export async function searchUsers(...args: Parameters<typeof authSearchUsers>) {
  return authSearchUsers(...args);
}

export async function getPublicSettings(...args: Parameters<typeof authGetPublicSettings>) {
  return authGetPublicSettings(...args);
}

export async function getUserPublicKeys(...args: Parameters<typeof authGetUserPublicKeys>) {
  return authGetUserPublicKeys(...args);
}

export async function validate2FALogin(...args: Parameters<typeof authValidate2FALogin>) {
  return authValidate2FALogin(...args);
}

export async function getRecoveryQuestion(...args: Parameters<typeof authGetRecoveryQuestion>) {
  return authGetRecoveryQuestion(...args);
}

export async function recoverPassword(...args: Parameters<typeof authRecoverPassword>) {
  return authRecoverPassword(...args);
}
