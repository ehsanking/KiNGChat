const CURVE = 'P-256';
const HKDF_SALT = 'Elahe Messenger-E2EE-v2';
const MESSAGE_INFO = 'message-encryption';

const cryptoApi = () => {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto API is required.');
  return globalThis.crypto;
};

const bytesToBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const utf8 = (value: string) => new TextEncoder().encode(value);

export async function generateAgreementKeyPair() {
  return cryptoApi().subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits', 'deriveKey'],
  );
}

export async function exportAgreementPublicKey(key: CryptoKey) {
  const raw = await cryptoApi().subtle.exportKey('raw', key);
  return bytesToBase64(raw);
}

export async function exportAgreementPrivateKey(key: CryptoKey) {
  const jwk = await cryptoApi().subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importAgreementPublicKey(publicKey: string) {
  return cryptoApi().subtle.importKey(
    'raw',
    base64ToBytes(publicKey),
    { name: 'ECDH', namedCurve: CURVE },
    true,
    [],
  );
}

export async function importAgreementPrivateKey(privateKey: string) {
  return cryptoApi().subtle.importKey(
    'jwk',
    JSON.parse(privateKey),
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits', 'deriveKey'],
  );
}

export async function deriveConversationKey(
  myAgreementPrivateKey: CryptoKey,
  theirSignedPreKeyPublicKey: CryptoKey,
  conversationId: string,
) {
  const sharedBits = await cryptoApi().subtle.deriveBits(
    { name: 'ECDH', public: theirSignedPreKeyPublicKey },
    myAgreementPrivateKey,
    256,
  );

  const rawKey = await cryptoApi().subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return cryptoApi().subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(HKDF_SALT),
      info: utf8(`${MESSAGE_INFO}:${conversationId}`),
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptConversationMessage(key: CryptoKey, plaintext: string) {
  const iv = cryptoApi().getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    utf8(plaintext),
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(iv),
  };
}

export async function decryptConversationMessage(key: CryptoKey, ciphertext: string, nonce: string) {
  const plaintext = await cryptoApi().subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(nonce) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
