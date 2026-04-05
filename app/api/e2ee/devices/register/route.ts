import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { verifySignedPreKey } from '@/lib/e2ee-signing';
import { getRequestIdForRequest, respondWithInternalError, respondWithSafeError } from '@/lib/http-errors';

const MAX_ONE_TIME_PREKEYS_PER_REQUEST = 500;

type NormalizedOneTimePreKey = {
  keyId: string;
  publicKey: string;
  signature: string | null;
  expiresAt: Date | null;
};

export function normalizeOneTimePreKeys(input: unknown[]): NormalizedOneTimePreKey[] {
  return input.reduce<NormalizedOneTimePreKey[]>((acc, item) => {
    const entry = item as Record<string, unknown>;
    if (typeof entry?.keyId !== 'string' || typeof entry?.publicKey !== 'string') {
      return acc;
    }

    const keyId = entry.keyId.trim();
    const publicKey = entry.publicKey.trim();
    if (!keyId || !publicKey) {
      return acc;
    }

    const expiresAtRaw = typeof entry.expiresAt === 'string' ? entry.expiresAt.trim() : '';
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAtRaw && Number.isNaN(expiresAt?.getTime())) {
      return acc;
    }

    const signature = typeof entry.signature === 'string' ? entry.signature.trim() : null;
    if (acc.some((existing) => existing.keyId === keyId)) {
      return acc;
    }

    acc.push({
      keyId,
      publicKey,
      signature: signature || null,
      expiresAt,
    });
    return acc;
  }, []);
}

export async function POST(request: Request) {
  const requestId = getRequestIdForRequest(request);
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return respondWithSafeError({ status: 401, message: 'Authentication required.', code: 'AUTH_REQUIRED', requestId });
    }

    const body = await request.json();
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const identityKeyPublic = typeof body?.identityKeyPublic === 'string' ? body.identityKeyPublic.trim() : '';
    const signingPublicKey = typeof body?.signingPublicKey === 'string' ? body.signingPublicKey.trim() : '';
    const signedPreKey = typeof body?.signedPreKey === 'string' ? body.signedPreKey.trim() : '';
    const signedPreKeySig = typeof body?.signedPreKeySig === 'string' ? body.signedPreKeySig.trim() : '';
    const ratchetPublicKey = typeof body?.ratchetPublicKey === 'string' ? body.ratchetPublicKey.trim() : '';
    const isPrimary = body?.isPrimary === true;
    const oneTimePreKeys = Array.isArray(body?.oneTimePreKeys) ? body.oneTimePreKeys : [];

    if (!deviceId || !identityKeyPublic || !signingPublicKey || !signedPreKey || !signedPreKeySig) {
      return respondWithSafeError({
        status: 400,
        message: 'Missing required device bundle fields.',
        code: 'VALIDATION_ERROR',
        action: 'Provide deviceId, identityKeyPublic, signingPublicKey, signedPreKey, and signedPreKeySig.',
        requestId,
      });
    }

    const signatureValid = await verifySignedPreKey(signedPreKey, signedPreKeySig, signingPublicKey);
    if (!signatureValid) {
      return respondWithSafeError({
        status: 400,
        message: 'Invalid signed pre-key signature.',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    if (oneTimePreKeys.length > MAX_ONE_TIME_PREKEYS_PER_REQUEST) {
      return respondWithSafeError({
        status: 400,
        message: 'Too many one-time prekeys in request.',
        code: 'VALIDATION_ERROR',
        action: `Submit at most ${MAX_ONE_TIME_PREKEYS_PER_REQUEST} one-time prekeys per request.`,
        requestId,
      });
    }

    const normalizedOneTimePreKeys = normalizeOneTimePreKeys(oneTimePreKeys);

    const device = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.userDevice.updateMany({ where: { userId: session.userId }, data: { isPrimary: false } });
      }
      const savedDevice = await tx.userDevice.upsert({
        where: { userId_deviceId: { userId: session.userId, deviceId } },
        update: {
          label: label || null,
          identityKeyPublic,
          signingPublicKey,
          signedPreKey,
          signedPreKeySig,
          ratchetPublicKey: ratchetPublicKey || null,
          isPrimary,
          isRevoked: false,
          lastPreKeyRotationAt: new Date(),
          lastSeenAt: new Date(),
        },
        create: {
          userId: session.userId,
          deviceId,
          label: label || null,
          identityKeyPublic,
          signingPublicKey,
          signedPreKey,
          signedPreKeySig,
          ratchetPublicKey: ratchetPublicKey || null,
          isPrimary,
          lastPreKeyRotationAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
      await tx.oneTimePreKey.deleteMany({ where: { deviceId: savedDevice.id, status: { in: ['AVAILABLE', 'RESERVED'] } } });
      if (normalizedOneTimePreKeys.length > 0) {
        await tx.oneTimePreKey.createMany({
          data: normalizedOneTimePreKeys.map((item) => ({
            userId: session.userId,
            deviceId: savedDevice.id,
            keyId: item.keyId,
            publicKey: item.publicKey,
            signature: item.signature,
            expiresAt: item.expiresAt,
          })),
        });
      }
      await tx.e2EEKeyEvent.create({
        data: {
          userId: session.userId,
          deviceId: savedDevice.id,
          eventType: 'DEVICE_REGISTERED',
          keyRef: signedPreKey,
          details: JSON.stringify({ label: label || null, oneTimePreKeyCount: normalizedOneTimePreKeys.length, isPrimary }),
        },
      });
      return savedDevice;
    });

    return NextResponse.json({ success: true, deviceId: device.deviceId });
  } catch (error) {
    return respondWithInternalError('E2EE device registration', error, { requestId });
  }
}
