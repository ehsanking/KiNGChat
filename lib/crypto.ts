/**
 * KiNGChat E2EE Crypto Module
 * Uses WebCrypto API for client-side encryption.
 * Implements basic primitives for X3DH and Double Ratchet.
 */

export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

export async function exportPublicKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return Buffer.from(exported).toString('base64');
}

export async function importPublicKey(base64Key: string) {
  const keyBuffer = Buffer.from(base64Key, 'base64');
  return await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

export async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey) {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(key: CryptoKey, message: string) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    enc.encode(message)
  );

  return {
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
  };
}

export async function decryptMessage(key: CryptoKey, ciphertextBase64: string, ivBase64: string) {
  const dec = new TextDecoder();
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );

  return dec.decode(decrypted);
}

// File encryption
export async function encryptFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const key = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    arrayBuffer
  );

  const exportedKey = await window.crypto.subtle.exportKey('raw', key);

  return {
    ciphertext: new Blob([ciphertext]),
    key: Buffer.from(exportedKey).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
  };
}
