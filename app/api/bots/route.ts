import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { listBots } from '@/lib/bot/bot-manager';

export async function GET(request: NextRequest) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const bots = await listBots();
  return NextResponse.json({ success: true, bots });
}
