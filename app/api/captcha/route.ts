import { NextResponse } from 'next/server';
import { createCaptchaChallengeResilient } from '@/lib/captcha-store';
import { generateCaptchaSvg, generateCaptchaText } from '@/lib/captcha';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const captchaText = generateCaptchaText();
    const captchaId = await createCaptchaChallengeResilient(captchaText);

    return NextResponse.json({
      success: true,
      captchaId,
      captchaSvg: generateCaptchaSvg(captchaText),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate captcha.',
      },
      { status: 500 },
    );
  }
}
