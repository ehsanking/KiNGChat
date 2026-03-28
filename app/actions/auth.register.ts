"use server";

// This module exposes registration-related server actions.  It re-exports the
// implementations from the central auth module, allowing other parts of the
// application to depend on smaller, more focused files instead of the
// monolithic app/actions/auth.ts.  Use this module when dealing with user
// sign-up.

export { registerUser } from './auth';
