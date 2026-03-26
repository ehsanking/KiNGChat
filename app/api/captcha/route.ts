import { NextResponse } from 'next/server';
import { generateCaptchaText, generateCaptchaSvg } from '@/lib/captcha';
import { createCaptchaChallengeResilient } from '@/lib/captcha-store';
import { logger } from '@/lib/logger';
import { getRateLimitHeaders, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/captcha
 * Returns a captcha ID and SVG image (base64-encoded data URI).
 */
export async function GET(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    const limitResult = await rateLimit(`captcha:${ip}`, { windowMs: 60_000, max: 20 });
    const rateLimitHeaders = getRateLimitHeaders(limitResult);
    if (!limitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many captcha requests. Please wait a minute.' },
        { status: 429, headers: rateLimitHeaders },
      );
    }

    const text = generateCaptchaText(5);
    const svg = generateCaptchaSvg(text);

    const captchaId = await createCaptchaChallengeResilient(text);

    // Convert SVG to base64 data URI
    const svgBase64 = Buffer.from(svg).toString('base64');
    const dataUri = `data:image/svg+xml;base64,${svgBase64}`;

    return NextResponse.json(
      {
        success: true,
        captchaId,
        image: dataUri,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          ...rateLimitHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('Captcha generation error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to generate captcha' }, { status: 500 });
  }
}
