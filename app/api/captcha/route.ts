import { NextResponse } from 'next/server';
import { createLocalCaptchaChallenge } from '@/lib/local-captcha';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const challenge = createLocalCaptchaChallenge();

    return NextResponse.json({
      success: true,
      captchaId: challenge.captchaId,
      prompt: challenge.prompt,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate captcha challenge.',
      },
      { status: 500 },
    );
  }
}
