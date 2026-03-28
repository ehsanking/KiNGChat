import { NextResponse } from 'next/server';
import { getLivenessSnapshot } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await getLivenessSnapshot(), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
