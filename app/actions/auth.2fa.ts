"use server";

// This module exposes two-factor authentication (2FA) server actions.  It
// re-exports implementations from the central auth module, allowing other
// parts of the application to depend on smaller, more focused files instead
// of the monolithic app/actions/auth.ts.  Use this module for setting up,
// verifying, disabling and validating 2FA tokens during login.

export { setup2FA, verify2FA, disable2FA, validate2FALogin } from './auth-legacy';
