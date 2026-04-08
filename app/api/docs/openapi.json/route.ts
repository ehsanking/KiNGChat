import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi/spec';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(openApiSpec);
}
