import { NextResponse } from 'next/server';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';

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

    return NextResponse.json({
      success: true,
      settings: {
        isRegistrationEnabled: settings.isRegistrationEnabled,
        isCaptchaEnabled: settings.isCaptchaEnabled && Boolean(recaptchaSiteKey),
        recaptchaSiteKey,
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
        isCaptchaEnabled: false,
        recaptchaSiteKey: null,
      },
      fallback: true,
    });
  }
}
