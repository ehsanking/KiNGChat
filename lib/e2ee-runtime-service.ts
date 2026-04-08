import { prisma } from '@/lib/prisma';
import { attachSenderE2EEPayload } from '@/lib/e2ee-server-envelope';
import { buildSessionBootstrapEnvelope, deriveForwardSecureStep, rotateRatchet } from '@/lib/e2ee-phase4';
import { incrementMetric } from '@/lib/observability';

export async function getRuntimePublicBundle(userId: string) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) throw new Error('User id is required.');

  const primaryDevice = await prisma.userDevice.findFirst({
    where: { userId: normalizedUserId, isRevoked: false },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    include: { oneTimePreKeys: { where: { status: 'AVAILABLE' }, orderBy: { createdAt: 'asc' }, take: 5 } },
  });

  if (primaryDevice) {
    return {
      userId: normalizedUserId,
      deviceId: primaryDevice.deviceId,
      identityKeyPublic: primaryDevice.identityKeyPublic,
      signingPublicKey: primaryDevice.signingPublicKey,
      signedPreKey: primaryDevice.signedPreKey,
      signedPreKeySig: primaryDevice.signedPreKeySig,
      ratchetPublicKey: primaryDevice.ratchetPublicKey,
      oneTimePreKeys: primaryDevice.oneTimePreKeys.map((item) => ({ keyId: item.keyId, publicKey: item.publicKey, signature: item.signature ?? undefined })),
      e2eeVersion: 'phase4',
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: { id: true, identityKeyPublic: true, signingPublicKey: true, signedPreKey: true, signedPreKeySig: true, e2eeVersion: true },
  });
  if (!user) throw new Error('User not found.');
  return {
    userId: user.id,
    deviceId: null,
    identityKeyPublic: user.identityKeyPublic,
    signingPublicKey: user.signingPublicKey ?? null,
    signedPreKey: user.signedPreKey,
    signedPreKeySig: user.signedPreKeySig,
    ratchetPublicKey: null,
    oneTimePreKeys: [],
    e2eeVersion: user.e2eeVersion ?? 'legacy',
  };
}

export async function getRuntimePreKeyBundle(userId: string, preferredDeviceId?: string | null) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) throw new Error('User id is required.');

  const device = await prisma.userDevice.findFirst({
    where: {
      userId: normalizedUserId,
      isRevoked: false,
      ...(preferredDeviceId ? { deviceId: preferredDeviceId } : {}),
    },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
  });
  if (!device) return getRuntimePublicBundle(normalizedUserId);

  const reservation = await prisma.$transaction(async (tx) => {
    const key = await tx.oneTimePreKey.findFirst({
      where: { deviceId: device.id, status: 'AVAILABLE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!key) return null;
    const updated = await tx.oneTimePreKey.update({
      where: { id: key.id },
      data: { status: 'RESERVED', reservedAt: new Date() },
    });
    return updated;
  });

  return {
    userId: normalizedUserId,
    deviceId: device.deviceId,
    label: device.label,
    isPrimary: device.isPrimary,
    identityKeyPublic: device.identityKeyPublic,
    signingPublicKey: device.signingPublicKey,
    signedPreKey: device.signedPreKey,
    signedPreKeySig: device.signedPreKeySig,
    ratchetPublicKey: device.ratchetPublicKey,
    oneTimePreKeys: reservation ? [{ keyId: reservation.keyId, publicKey: reservation.publicKey, signature: reservation.signature ?? undefined, status: reservation.status as "AVAILABLE" | "RESERVED" | "CONSUMED" | "REVOKED" }] : [],
    e2eeVersion: 'phase4',
  };
}

export async function bootstrapDeviceSession(params: {
  initiatorUserId: string;
  initiatorDeviceId: string;
  recipientUserId: string;
  recipientDeviceId?: string | null;
  initialMessageKeyId: string;
  ratchetPublicKey?: string | null;
}) {
  const bundle = await getRuntimePreKeyBundle(params.recipientUserId, params.recipientDeviceId ?? undefined);
  if (!bundle.deviceId) throw new Error('Recipient does not have a registered phase4 device.');

  const initiatorDevice = await prisma.userDevice.findFirst({
    where: { userId: params.initiatorUserId, deviceId: params.initiatorDeviceId, isRevoked: false },
  });
  if (!initiatorDevice) throw new Error('Initiator device not found.');

  const seed = `${params.initiatorUserId}:${params.initiatorDeviceId}:${bundle.userId}:${bundle.deviceId}:${params.initialMessageKeyId}`;
  const step = await deriveForwardSecureStep(seed, 0);
  const ratchetStep = await rotateRatchet(step.nextRootKeyRef, params.ratchetPublicKey ?? bundle.ratchetPublicKey ?? bundle.signedPreKey);

  const recipientDevice = await prisma.userDevice.findFirstOrThrow({ where: { userId: bundle.userId, deviceId: bundle.deviceId, isRevoked: false } });
  const consumedKeyId = bundle.oneTimePreKeys[0]?.keyId ?? null;

  const session = await prisma.$transaction(async (tx) => {
    if (consumedKeyId) {
      const selected = await tx.oneTimePreKey.findFirst({ where: { deviceId: recipientDevice.id, keyId: consumedKeyId } });
      if (selected && selected.status !== 'CONSUMED') {
        await tx.oneTimePreKey.update({ where: { id: selected.id }, data: { status: 'CONSUMED', consumedAt: new Date() } });
      }
    }
    const created = await tx.e2EESession.upsert({
      where: { initiatorDeviceId_recipientDeviceId: { initiatorDeviceId: initiatorDevice.id, recipientDeviceId: recipientDevice.id } },
      update: {
        rootKeyRef: ratchetStep.nextRootKeyRef,
        sendingChainKeyRef: ratchetStep.sendingChainKeyRef,
        receivingChainKeyRef: ratchetStep.receivingChainKeyRef,
        status: 'ACTIVE',
        lastUsedAt: new Date(),
      },
      create: {
        initiatorUserId: params.initiatorUserId,
        initiatorDeviceId: initiatorDevice.id,
        recipientUserId: bundle.userId,
        recipientDeviceId: recipientDevice.id,
        bootstrapPreKeyId: consumedKeyId,
        rootKeyRef: ratchetStep.nextRootKeyRef,
        sendingChainKeyRef: ratchetStep.sendingChainKeyRef,
        receivingChainKeyRef: ratchetStep.receivingChainKeyRef,
        status: 'ACTIVE',
      },
    });
    await tx.e2EEKeyEvent.create({
      data: {
        userId: params.initiatorUserId,
        deviceId: initiatorDevice.id,
        eventType: 'SESSION_BOOTSTRAPPED',
        keyRef: created.rootKeyRef,
        details: JSON.stringify({ recipientUserId: bundle.userId, recipientDeviceId: bundle.deviceId, bootstrapPreKeyId: consumedKeyId }),
      },
    });
    return created;
  });
  incrementMetric('elahe_e2ee_sessions_established');

  return {
    sessionId: session.id,
    bootstrap: buildSessionBootstrapEnvelope({
      recipientUserId: bundle.userId,
      recipientDeviceId: bundle.deviceId,
      preKeyBundle: {
        identityKeyPublic: bundle.identityKeyPublic,
        signingPublicKey: bundle.signingPublicKey ?? '',
        signedPreKey: bundle.signedPreKey,
        signedPreKeySig: bundle.signedPreKeySig,
        ratchetPublicKey: bundle.ratchetPublicKey ?? null,
        oneTimePreKeys: bundle.oneTimePreKeys,
      },
      initialMessageKeyId: params.initialMessageKeyId,
      ratchetHeader: { publicKey: params.ratchetPublicKey ?? initiatorDevice.ratchetPublicKey ?? initiatorDevice.signedPreKey, previousChainLength: 0, messageNumber: 0 },
    }),
  };
}

export async function listUserDevices(userId: string) {
  return prisma.userDevice.findMany({
    where: { userId, isRevoked: false },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    include: { _count: { select: { oneTimePreKeys: true } } },
  });
}

export async function buildRuntimeSocketEnvelope(message: {
  id: string;
  senderId: string;
  recipientId?: string | null;
  groupId?: string | null;
  type: number;
  ciphertext: string;
  nonce: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  createdAt: string;
}) {
  const senderBundle = await getRuntimePublicBundle(message.senderId);
  return attachSenderE2EEPayload(message, {
    identityKeyPublic: senderBundle.identityKeyPublic,
    signingPublicKey: senderBundle.signingPublicKey,
    signedPreKey: senderBundle.signedPreKey,
    signedPreKeySig: senderBundle.signedPreKeySig,
    e2eeVersion: senderBundle.e2eeVersion,
  });
}
