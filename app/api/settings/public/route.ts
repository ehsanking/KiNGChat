import { NextResponse } from 'next/server';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/settings/public
 * Returns public-facing settings (captcha enabled, registration enabled).
 * This is a REST endpoint used by login/register pages instead of
 * server actions, which can fail silently in custom-server Docker deployments.
 */
export async function GET() {
  try {
    const settings = await getOrCreateAdminSettings();

    return NextResponse.json({
      success: true,
      settings: {
        isCaptchaEnabled: settings.isCaptchaEnabled,
        isRegistrationEnabled: settings.isRegistrationEnabled,
        captchaProvider: settings.isCaptchaEnabled ? 'local-math' : 'disabled',
      },
    });
  } catch (error) {
    logger.error('Failed to fetch public settings via API.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      success: true,
      settings: {
        isCaptchaEnabled: false,
        isRegistrationEnabled: true,
        captchaProvider: 'disabled',
      },
      fallback: true,
    });
  }
}
