export type OneTimePreKey = {
  keyId: string;
  publicKey: string;
  signature?: string;
  status?: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'REVOKED';
  expiresAt?: string | null;
};

export type PreKeyBundle = {
  identityKeyPublic: string;
  signingPublicKey: string;
  signedPreKey: string;
  signedPreKeySig: string;
  ratchetPublicKey?: string | null;
  oneTimePreKeys: OneTimePreKey[];
};

export type DeviceBundle = {
  deviceId: string;
  label?: string | null;
  isPrimary?: boolean;
  lastPreKeyRotationAt?: string | null;
  preKeyBundle: PreKeyBundle;
};

export type SessionBootstrapEnvelope = {
  protocolVersion: 'phase4';
  recipientUserId: string;
  recipientDeviceId?: string | null;
  preKeyBundle: PreKeyBundle;
  initialMessageKeyId: string;
  ratchetHeader?: {
    publicKey: string;
    previousChainLength: number;
    messageNumber: number;
  } | null;
  createdAt: string;
};

const encoder = new TextEncoder();

const bytesToBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const cryptoApi = () => {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto API is required.');
  return globalThis.crypto;
};

async function deriveBytes(secret: string, info: string) {
  const material = await cryptoApi().subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveBits']);
  const bits = await cryptoApi().subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode('elahe-phase4-ratchet'),
    info: encoder.encode(info),
  }, material, 256);
  return bytesToBase64(bits);
}

export const buildSessionBootstrapEnvelope = (payload: Omit<SessionBootstrapEnvelope, 'protocolVersion' | 'createdAt'>): SessionBootstrapEnvelope => ({
  protocolVersion: 'phase4',
  createdAt: new Date().toISOString(),
  ...payload,
});

export async function deriveForwardSecureStep(rootKeyRef: string, messageNumber: number) {
  const nextRootKeyRef = await deriveBytes(rootKeyRef, `root:${messageNumber}`);
  const chainKeyRef = await deriveBytes(rootKeyRef, `chain:${messageNumber}`);
  const messageKeyRef = await deriveBytes(chainKeyRef, `message:${messageNumber}`);
  return { nextRootKeyRef, chainKeyRef, messageKeyRef };
}

export async function rotateRatchet(rootKeyRef: string, remoteRatchetPublicKey: string) {
  const nextRootKeyRef = await deriveBytes(rootKeyRef, `ratchet:${remoteRatchetPublicKey}`);
  const sendingChainKeyRef = await deriveBytes(nextRootKeyRef, 'sending');
  const receivingChainKeyRef = await deriveBytes(nextRootKeyRef, 'receiving');
  return { nextRootKeyRef, sendingChainKeyRef, receivingChainKeyRef };
}

export async function secureKeyLifecycleEvent(keyRef: string, purpose: 'bootstrap' | 'rotate' | 'revoke' | 'expire') {
  const lifecycleRef = await deriveBytes(keyRef, `lifecycle:${purpose}`);
  return { lifecycleRef, purpose, createdAt: new Date().toISOString() };
}
