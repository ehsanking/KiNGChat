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
  generateCaptcha as authGenerateCaptcha,
  registerUser as authRegisterUser,
  loginUser as authLoginUser,
  searchUsers as authSearchUsers,
  getPublicSettings as authGetPublicSettings,
  getUserPublicKeys as authGetUserPublicKeys,
  validate2FALogin as authValidate2FALogin,
} from './auth';

export async function generateCaptcha(...args: Parameters<typeof authGenerateCaptcha>) {
  return authGenerateCaptcha(...args);
}

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
