import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Legacy endpoint kept for backward compatibility.
 * Image captcha has been removed in favor of Cloudflare Turnstile.
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Image captcha deprecated. Use Turnstile on login/register.' },
    { status: 410 },
  );
}
