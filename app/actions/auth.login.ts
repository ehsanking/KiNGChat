"use server";

// This module exposes login-related server actions.  It re-exports the
// implementations from the central auth module, allowing other parts of the
// application to depend on smaller, more focused files instead of the
// monolithic app/actions/auth.ts.  Additional login helpers can be added
// here over time without growing the main auth file.

import { loginUser as loginUserLegacy, validate2FALogin as validate2FALoginLegacy } from './auth-legacy';

export async function loginUser(...args: Parameters<typeof loginUserLegacy>) {
  return loginUserLegacy(...args);
}

export async function validate2FALogin(...args: Parameters<typeof validate2FALoginLegacy>) {
  return validate2FALoginLegacy(...args);
}
