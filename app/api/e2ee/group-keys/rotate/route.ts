import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';

const ALLOWED_ROTATE_ROLES = new Set(['OWNER', 'ADMIN']);

type GroupSenderKeyLookupDelegate = {
  findFirst(args: unknown): Promise<{ keyGeneration?: number } | null>;
};

export async function POST(request: NextRequest) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { groupId?: string } | null;
  const groupId = body?.groupId?.trim();
  if (!groupId) return NextResponse.json({ error: 'groupId is required.' }, { status: 400 });

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.id } },
    select: { role: true },
  });

  if (!member || !ALLOWED_ROTATE_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Only group admins can rotate sender keys.' }, { status: 403 });
  }

  const prismaCompat = prisma as unknown as { groupSenderKey: GroupSenderKeyLookupDelegate };
  const latest = await prismaCompat.groupSenderKey.findFirst({
    where: { groupId, userId: session.id },
    orderBy: { keyGeneration: 'desc' },
    select: { keyGeneration: true },
  });

  return NextResponse.json({ success: true, groupId, nextKeyGeneration: (latest?.keyGeneration ?? -1) + 1 });
}
