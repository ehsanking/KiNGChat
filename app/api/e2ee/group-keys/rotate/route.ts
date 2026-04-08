import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { toValidationErrorResponse, validateBody } from '@/lib/validation/middleware';
import { z } from 'zod';

const ALLOWED_ROTATE_ROLES = new Set(['OWNER', 'ADMIN']);

export async function POST(request: NextRequest) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const validation = validateBody(z.object({ groupId: z.string().trim().min(1) }), body);
  if (!validation.success) return NextResponse.json(toValidationErrorResponse(validation), { status: 400 });
  const groupId = validation.data.groupId;

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.id } },
    select: { role: true },
  });

  if (!member || !ALLOWED_ROTATE_ROLES.has(member.role)) {
    return NextResponse.json({ error: 'Only group admins can rotate sender keys.' }, { status: 403 });
  }

  const latest = await prisma.groupSenderKey.findFirst({
    where: { groupId, userId: session.id },
    orderBy: { keyGeneration: 'desc' },
    select: { keyGeneration: true },
  });

  return NextResponse.json({ success: true, groupId, nextKeyGeneration: (latest?.keyGeneration ?? -1) + 1 });
}
