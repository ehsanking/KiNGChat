"use server";

// This module exposes login-related server actions.  It re-exports the
// implementations from the central auth module, allowing other parts of the
// application to depend on smaller, more focused files instead of the
// monolithic app/actions/auth.ts.  Additional login helpers can be added
// here over time without growing the main auth file.

export { loginUser, validate2FALogin } from './auth-legacy';
