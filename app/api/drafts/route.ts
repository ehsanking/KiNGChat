import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { listDrafts, saveDraft, deleteDraft } from '@/lib/messaging-service';

export async function GET(req: NextRequest) {
  const session = await requireFreshAuthenticatedUser(req);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return NextResponse.json(await listDrafts(session.id));
}

export async function POST(req: NextRequest) {
  const session = await requireFreshAuthenticatedUser(req);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await saveDraft(session.id, {
    recipientId: typeof body?.recipientId === 'string' ? body.recipientId : undefined,
    groupId: typeof body?.groupId === 'string' ? body.groupId : undefined,
    ciphertext: typeof body?.ciphertext === 'string' ? body.ciphertext : undefined,
    nonce: typeof body?.nonce === 'string' ? body.nonce : undefined,
    clientDraft: typeof body?.clientDraft === 'string' ? body.clientDraft : undefined,
  });
  return NextResponse.json(result, { status: 'error' in result ? 400 : 200 });
}

export async function DELETE(req: NextRequest) {
  const session = await requireFreshAuthenticatedUser(req);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await deleteDraft(
    session.id,
    typeof body?.recipientId === 'string' ? body.recipientId : undefined,
    typeof body?.groupId === 'string' ? body.groupId : undefined,
  );
  return NextResponse.json(result);
}
