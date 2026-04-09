import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { getThreadMessages } from '@/lib/messaging-service';

export async function GET(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const params = await context.params;
  const result = await getThreadMessages(session.id, params.messageId);
  return NextResponse.json(result, { status: 'error' in result ? 403 : 200 });
}
