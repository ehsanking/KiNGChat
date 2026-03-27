const FILE_INFO = 'file-key-wrap';
const HKDF_SALT = 'Elahe Messenger-E2EE-v2';

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

export type AttachmentEnvelope = {
  ciphertext: Blob;
  fileNonce: string;
  wrappedFileKey: string;
  wrappedFileKeyNonce: string;
};

const importRawAesKey = async (rawKey: string, extractable = false) =>
  cryptoApi().subtle.importKey(
    'raw',
    base64ToBytes(rawKey),
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );

const deriveFileWrapKey = async (conversationKey: CryptoKey, context: string) => {
  const exportedConversationKey = await cryptoApi().subtle.exportKey('raw', conversationKey);
  const hkdfKey = await cryptoApi().subtle.importKey('raw', exportedConversationKey, 'HKDF', false, ['deriveKey']);

  return cryptoApi().subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(HKDF_SALT),
      info: utf8(`${FILE_INFO}:${context}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export async function encryptAttachment(file: File, conversationKey: CryptoKey, context: string): Promise<AttachmentEnvelope> {
  const fileKey = await cryptoApi().subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const fileNonce = cryptoApi().getRandomValues(new Uint8Array(12));
  const wrappedFileKeyNonce = cryptoApi().getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();

  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: 'AES-GCM', iv: fileNonce },
    fileKey,
    plaintext,
  );

  const rawFileKey = await cryptoApi().subtle.exportKey('raw', fileKey);
  const fileWrapKey = await deriveFileWrapKey(conversationKey, context);
  const wrappedFileKey = await cryptoApi().subtle.encrypt(
    { name: 'AES-GCM', iv: wrappedFileKeyNonce },
    fileWrapKey,
    rawFileKey,
  );

  return {
    ciphertext: new Blob([ciphertext]),
    fileNonce: bytesToBase64(fileNonce),
    wrappedFileKey: bytesToBase64(wrappedFileKey),
    wrappedFileKeyNonce: bytesToBase64(wrappedFileKeyNonce),
  };
}

export async function decryptAttachment(
  encryptedBlob: Blob,
  conversationKey: CryptoKey,
  context: string,
  wrappedFileKey: string,
  wrappedFileKeyNonce: string,
  fileNonce: string,
) {
  const fileWrapKey = await deriveFileWrapKey(conversationKey, context);
  const rawFileKey = await cryptoApi().subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(wrappedFileKeyNonce) },
    fileWrapKey,
    base64ToBytes(wrappedFileKey),
  );
  const fileKey = await importRawAesKey(bytesToBase64(rawFileKey));
  const ciphertext = await encryptedBlob.arrayBuffer();
  return cryptoApi().subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(fileNonce) },
    fileKey,
    ciphertext,
  );
}
