import { NextResponse } from 'next/server';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';
import { createLocalCaptchaChallenge } from '@/lib/local-captcha';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/settings/public
 * Returns public-facing settings (registration and captcha settings).
 * This is a REST endpoint used by login/register pages instead of
 * server actions, which can fail silently in custom-server Docker deployments.
 */
export async function GET() {
  try {
    const settings = await getOrCreateAdminSettings();
    const recaptchaSiteKey = typeof (settings as Record<string, unknown>).recaptchaSiteKey === 'string'
      ? (settings as Record<string, unknown>).recaptchaSiteKey as string
      : null;
    const captchaProvider = (process.env.CAPTCHA_PROVIDER ?? 'recaptcha').trim().toLowerCase();
    const localCaptcha = captchaProvider === 'local' ? createLocalCaptchaChallenge() : null;

    return NextResponse.json({
      success: true,
      settings: {
        isRegistrationEnabled: settings.isRegistrationEnabled,
        captchaProvider,
        isCaptchaEnabled: settings.isCaptchaEnabled && (
          captchaProvider === 'local' || Boolean(recaptchaSiteKey)
        ),
        recaptchaSiteKey,
        localCaptcha,
        oauthProviders: {
          google: Boolean((settings as Record<string, unknown>).oauthGoogleEnabled),
          github: Boolean((settings as Record<string, unknown>).oauthGithubEnabled),
          oidc: Boolean((settings as Record<string, unknown>).oauthOidcEnabled),
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch public settings via API.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      success: true,
      settings: {
        isRegistrationEnabled: true,
        captchaProvider: 'recaptcha',
        isCaptchaEnabled: false,
        recaptchaSiteKey: null,
        localCaptcha: null,
        oauthProviders: {
          google: false,
          github: false,
          oidc: false,
        },
      },
      fallback: true,
    });
  }
}
