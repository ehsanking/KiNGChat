import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { toValidationErrorResponse, validateBody } from '@/lib/validation/middleware';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const validation = validateBody(z.object({
    groupId: z.string().trim().min(1),
    keyGeneration: z.number().int().min(0).optional(),
    senderPublicKey: z.string().trim().min(1),
    chainKey: z.string().trim().min(1),
    deviceId: z.string().trim().min(1).optional(),
    wrappedKeys: z.array(z.object({ recipientUserId: z.string().trim().min(1), wrappedKey: z.string().trim().min(1), nonce: z.string().trim().min(1) })).min(1),
  }), body);
  if (!validation.success) {
    return NextResponse.json(toValidationErrorResponse(validation), { status: 400 });
  }

  const groupId = validation.data.groupId;
  const wrappedKeys = validation.data.wrappedKeys;
  const senderPublicKey = validation.data.senderPublicKey;
  const chainKey = validation.data.chainKey;
  const deviceId = validation.data.deviceId || 'default-device';
  const keyGeneration = validation.data.keyGeneration ?? 0;

  if (!groupId || !senderPublicKey || !chainKey || wrappedKeys.length === 0) {
    return NextResponse.json({ error: 'Invalid sender key distribution payload.' }, { status: 400 });
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.id } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

  await prisma.$transaction(async (tx: {
    groupSenderKey: typeof prisma.groupSenderKey;
    groupSenderKeyDistribution: typeof prisma.groupSenderKeyDistribution;
  }) => {
    await tx.groupSenderKey.upsert({
      where: { groupId_userId_deviceId: { groupId, userId: session.id, deviceId } },
      update: { chainKey, publicKey: senderPublicKey, keyGeneration },
      create: { groupId, userId: session.id, deviceId, chainKey, publicKey: senderPublicKey, keyGeneration },
    });

    await tx.groupSenderKeyDistribution.createMany({
      data: wrappedKeys
        .filter((item) => item?.recipientUserId?.trim() && item?.wrappedKey?.trim() && item?.nonce?.trim())
        .map((item) => ({
          groupId,
          senderUserId: session.id,
          recipientUserId: item.recipientUserId.trim(),
          wrappedKey: item.wrappedKey.trim(),
          nonce: item.nonce.trim(),
          keyGeneration,
        })),
    });
  });

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const session = await requireFreshAuthenticatedUser(request);
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const pending = await prisma.groupSenderKeyDistribution.findMany({
    where: { recipientUserId: session.id, consumed: false },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  await prisma.groupSenderKeyDistribution.updateMany({
    where: { id: { in: pending.map((item: (typeof pending)[number]) => item.id) } },
    data: { consumed: true },
  });

  return NextResponse.json({ success: true, distributions: pending });
}
