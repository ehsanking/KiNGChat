import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { respondWithInternalError, respondWithSafeError } from '@/lib/http-errors';

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await context.params;
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
      return respondWithSafeError({ status: 400, message: 'User id is required.', code: 'VALIDATION_ERROR' });
    }

    const user = await prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        identityKeyPublic: true,
        signedPreKey: true,
        signedPreKeySig: true,
        signingPublicKey: true,
        e2eeVersion: true,
        devices: {
          where: { isRevoked: false },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
          select: { deviceId: true, label: true, isPrimary: true, ratchetPublicKey: true, lastPreKeyRotationAt: true, _count: { select: { oneTimePreKeys: true } } },
        },
      },
    });

    if (!user) return respondWithSafeError({ status: 404, message: 'User not found.', code: 'REQUEST_REJECTED' });

    return NextResponse.json({
      success: true,
      keys: {
        userId: user.id,
        agreementPublicKey: user.identityKeyPublic,
        signingPublicKey: user.signingPublicKey ?? null,
        signedPreKey: user.signedPreKey,
        signedPreKeySig: user.signedPreKeySig,
        e2eeVersion: user.devices.length ? 'phase4' : (user.e2eeVersion ?? 'v2'),
        devices: user.devices.map((device: (typeof user.devices)[number]) => ({
          deviceId: device.deviceId,
          label: device.label,
          isPrimary: device.isPrimary,
          ratchetPublicKey: device.ratchetPublicKey,
          lastPreKeyRotationAt: device.lastPreKeyRotationAt,
          availablePreKeys: device._count.oneTimePreKeys,
        })),
      },
    });
  } catch (error) {
    return respondWithInternalError('E2EE public keys API', error);
  }
}
