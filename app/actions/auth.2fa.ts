'use server';

/**
 * @deprecated Legacy 2FA entrypoint.
 * Migration guide:
 * - Import from `security-2fa.actions.ts`.
 */

import {
  disable2FA as origDisable2FA,
  setup2FA as origSetup2FA,
  validate2FALogin as origValidate2FALogin,
  verify2FA as origVerify2FA,
} from './security-2fa.actions';

export async function setup2FA(...args: Parameters<typeof origSetup2FA>) {
  return origSetup2FA(...args);
}

export async function verify2FA(...args: Parameters<typeof origVerify2FA>) {
  return origVerify2FA(...args);
}

export async function disable2FA(...args: Parameters<typeof origDisable2FA>) {
  return origDisable2FA(...args);
}

export async function validate2FALogin(...args: Parameters<typeof origValidate2FALogin>) {
  return origValidate2FALogin(...args);
}
