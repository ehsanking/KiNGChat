import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
    let settings = await prisma.adminSettings.findUnique({ where: { id: '1' } });
    if (!settings) {
      settings = await prisma.adminSettings.create({ data: { id: '1', isCaptchaEnabled: false } });
    }

    return NextResponse.json({
      success: true,
      settings: {
        isCaptchaEnabled: settings.isCaptchaEnabled,
        isRegistrationEnabled: settings.isRegistrationEnabled,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch public settings via API.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      success: true,
      settings: {
        isCaptchaEnabled: true,
        isRegistrationEnabled: true,
      },
      fallback: true,
    });
  }
}
