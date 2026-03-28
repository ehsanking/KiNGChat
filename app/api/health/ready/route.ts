import { NextResponse } from 'next/server';
import { getReadinessSnapshot } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const snapshot = await getReadinessSnapshot();

  return NextResponse.json(snapshot.payload, {
    status: snapshot.httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
