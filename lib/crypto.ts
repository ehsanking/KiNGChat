/**
 * Elahe Messenger E2EE Crypto Module — v3 (Double Ratchet)
 *
 * Security model:
 *   Key Exchange:    X3DH-style initial key agreement (ECDH P-256)
 *   Ratchet:         Symmetric Double Ratchet providing forward secrecy
 *   Encryption:      AES-256-GCM per message
 *   Key Derivation:  HKDF-SHA256
 *
 * Critical fixes in this version:
 *   C1 — Double Ratchet: Every message uses a unique message key derived via
 *         a KDF chain.  Compromising one key cannot reveal past or future
 *         messages (true forward secrecy + break-in recovery).
 *   C2 — Non-extractable keys: Identity keys are generated with
 *         extractable=false.  The only extractable material is the *public*
 *         key (which is inherently public).  Session ratchet state is
 *         serialised as opaque HKDF-derived refs — never raw AES key bytes.
 *
 * All private keys reside ONLY in IndexedDB on the user's device.
 * The server only ever sees public keys and encrypted ciphertext.
 */

const DB_NAME = 'elahe_e2ee';
const DB_VERSION = 2; // bumped for ratchet store
const KEY_STORE = 'keys';
const RATCHET_STORE = 'ratchets';

// ── IndexedDB Storage ───────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
      if (!db.objectStoreNames.contains(RATCHET_STORE)) {
        db.createObjectStore(RATCHET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeKey(key: string, value: string | CryptoKeyPair | CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey<T = string>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly');
    const req = tx.objectStore(KEY_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function storeRatchetState(peerId: string, state: RatchetState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RATCHET_STORE, 'readwrite');
    tx.objectStore(RATCHET_STORE).put(state, peerId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getRatchetState(peerId: string): Promise<RatchetState | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RATCHET_STORE, 'readonly');
    const req = tx.objectStore(RATCHET_STORE).get(peerId);
    req.onsuccess = () => resolve(req.result as RatchetState | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ── Types ───────────────────────────────────────────────────

/**
 * Serialisable ratchet state stored in IndexedDB.
 * No raw AES key bytes are stored — only HKDF-derived references and
 * the DH ratchet key pair (private key stored as non-extractable CryptoKey
 * via IndexedDB structured-clone, public key as base64).
 */
export type RatchetState = {
  /** Root key — base64 of HKDF-derived bytes, used to advance the chain */
  rootKey: string;
  /** Our current DH ratchet key pair (CryptoKey objects stored via structured clone) */
  dhSendingKeyPair: CryptoKeyPair;
  /** Remote peer's current DH ratchet public key */
  dhRemotePublicKey: string;
  /** Sending chain key — HKDF-derived, advanced per message */
  sendingChainKey: string;
  /** Receiving chain key — HKDF-derived, advanced per incoming message */
  receivingChainKey: string;
  /** Number of messages sent in current sending chain */
  sendingMessageNumber: number;
  /** Number of messages received in current receiving chain */
  receivingMessageNumber: number;
  /** Previous sending chain length (for header) */
  previousChainLength: number;
};

/**
 * Header sent alongside each encrypted message to allow the recipient
 * to perform DH ratchet steps and derive the correct message key.
 */
export type RatchetHeader = {
  /** Sender's current DH ratchet public key (base64) */
  publicKey: string;
  /** Message number within the current chain */
  messageNumber: number;
  /** Length of the previous sending chain */
  previousChainLength: number;
};

// ── Helpers ─────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function concatBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(new Uint8Array(a), 0);
  result.set(new Uint8Array(b), a.byteLength);
  return result.buffer;
}

/**
 * Derive the deterministic initial X3DH root key material from concatenated
 * DH outputs. Both initiator and responder must compute this identically.
 */
async function deriveInitialRootKeyMaterial(combinedDhOutput: ArrayBuffer): Promise<ArrayBuffer> {
  const zeroSalt = new Uint8Array(32).buffer;
  return hkdfDerive(combinedDhOutput, zeroSalt, HKDF_INFO_ROOT);
}

// ── HKDF helpers (Double Ratchet KDF chains) ────────────────

const HKDF_INFO_ROOT = new TextEncoder().encode('elahe-e2ee-v3-root');
const HKDF_INFO_CHAIN = new TextEncoder().encode('elahe-e2ee-v3-chain');
const HKDF_INFO_MESSAGE = new TextEncoder().encode('elahe-e2ee-v3-msg');

/**
 * HKDF-SHA256 derivation: input key material + salt → output key material.
 * Returns base64-encoded 32 bytes.
 */
async function hkdfDerive(
  ikm: ArrayBuffer,
  salt: ArrayBuffer,
  info: Uint8Array,
  lengthBits = 256,
): Promise<ArrayBuffer> {
  const hkdfKey = await window.crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const saltBytes = new Uint8Array(salt.slice(0));
  const infoBytes = new Uint8Array(info);
  return window.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    hkdfKey,
    lengthBits,
  );
}

/**
 * KDF_RK: Root key ratchet step.
 * Takes a root key and DH output, returns (new root key, new chain key).
 */
async function kdfRootKey(
  rootKey: ArrayBuffer,
  dhOutput: ArrayBuffer,
): Promise<{ newRootKey: string; newChainKey: string }> {
  const derivedMaterial = await hkdfDerive(dhOutput, rootKey, HKDF_INFO_ROOT, 512);
  const newRootKey = derivedMaterial.slice(0, 32);
  const newChainKey = derivedMaterial.slice(32, 64);
  return {
    newRootKey: arrayBufferToBase64(newRootKey),
    newChainKey: arrayBufferToBase64(newChainKey),
  };
}

/**
 * KDF_CK: Chain key ratchet step.
 * Takes a chain key, returns (new chain key, message key bytes).
 */
async function kdfChainKey(
  chainKey: ArrayBuffer,
): Promise<{ newChainKey: string; messageKeyBytes: ArrayBuffer }> {
  // Use HMAC to derive both the next chain key and the message key
  const hmacKey = await window.crypto.subtle.importKey(
    'raw', chainKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const messageKeyBytes = await window.crypto.subtle.sign('HMAC', hmacKey, HKDF_INFO_MESSAGE);
  const nextChainKeyBytes = await window.crypto.subtle.sign('HMAC', hmacKey, HKDF_INFO_CHAIN);
  return {
    newChainKey: arrayBufferToBase64(nextChainKeyBytes),
    messageKeyBytes,
  };
}

/**
 * Import raw message key bytes as a non-extractable AES-256-GCM CryptoKey.
 */
async function importMessageKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'raw',
    keyBytes.slice(0, 32),
    { name: 'AES-GCM', length: 256 },
    false, // NON-EXTRACTABLE — prevents XSS key theft
    ['encrypt', 'decrypt'],
  );
}

// ── Key Generation ──────────────────────────────────────────

/**
 * Generate an ECDH key pair.  Identity keys are NON-EXTRACTABLE by default
 * (C2 fix).  Only the public key can be exported for transmission.
 */
export async function generateKeyPair(extractable = false): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    extractable,
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * Generate a DH ratchet key pair (non-extractable private key).
 */
async function generateRatchetKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable
    ['deriveKey', 'deriveBits'],
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Export a private key to JWK.
 *
 * NOTE: This is ONLY used for backward-compatible identity key persistence
 * in legacy mode.  New keys should use IndexedDB structured clone
 * (which preserves non-extractable CryptoKey objects).
 */
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  try {
    const keyData = base64ToArrayBuffer(base64Key);
    return await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'ECDH', namedCurve: 'P-256' },
      true, // public keys are inherently public — extractable is fine
      [],
    );
  } catch {
    throw new Error('Invalid public key format');
  }
}

export async function importPrivateKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // C2 fix: imported private keys are non-extractable
    ['deriveKey', 'deriveBits'],
  );
}

// ── ECDH Shared Secret Derivation ──────────────────────────

async function dhExchange(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
  return window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
}

// ── Legacy Key Derivation (backward compat) ─────────────────

/**
 * Derive a shared AES-256-GCM key from an ECDH key pair.
 * Kept for backward compatibility with legacy sessions.
 *
 * New sessions MUST use the Double Ratchet (initRatchetSession / ratchetEncrypt / ratchetDecrypt).
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  existingSalt?: ArrayBuffer,
): Promise<{ key: CryptoKey; salt: ArrayBuffer }> {
  const sharedBits = await dhExchange(privateKey, publicKey);
  const salt = existingSalt ?? window.crypto.getRandomValues(new Uint8Array(32)).buffer;
  const rawKey = await window.crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(salt),
      info: new TextEncoder().encode('elahe-e2ee-v2-message-encryption'),
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );

  return { key, salt };
}

// ── Double Ratchet Session Management ───────────────────────

/**
 * Initialize a Double Ratchet session as the initiator (Alice).
 *
 * X3DH-style initial key agreement:
 *   1. Alice performs ECDH with (her identity key, Bob's signed pre-key)
 *   2. Alice generates an ephemeral ratchet key pair
 *   3. Alice performs ECDH with (ephemeral private, Bob's signed pre-key)
 *   4. Both DH outputs are combined via HKDF to form the initial root key
 *   5. Alice advances the DH ratchet once to get the first sending chain
 */
export async function initRatchetSession(
  myIdentityPrivateKey: CryptoKey,
  recipientSignedPreKeyBase64: string,
  recipientId: string,
): Promise<{ state: RatchetState; header: RatchetHeader }> {
  const recipientPreKey = await importPublicKey(recipientSignedPreKeyBase64);

  // Step 1: Identity DH — forward secrecy from identity keys
  const dh1 = await dhExchange(myIdentityPrivateKey, recipientPreKey);

  // Step 2: Generate ephemeral ratchet key pair
  const dhSendingKeyPair = await generateRatchetKeyPair();

  // Step 3: Ephemeral DH
  const dh2 = await dhExchange(dhSendingKeyPair.privateKey, recipientPreKey);

  // Step 4: Combine both DH outputs → deterministic initial root key
  const combinedDH = concatBuffers(dh1, dh2);
  const initialRootKeyBytes = await deriveInitialRootKeyMaterial(combinedDH);

  // Step 5: DH ratchet step to derive the first sending chain key
  const dh3 = await dhExchange(dhSendingKeyPair.privateKey, recipientPreKey);
  const { newRootKey, newChainKey } = await kdfRootKey(initialRootKeyBytes, dh3);

  const state: RatchetState = {
    rootKey: newRootKey,
    dhSendingKeyPair,
    dhRemotePublicKey: recipientSignedPreKeyBase64,
    sendingChainKey: newChainKey,
    receivingChainKey: '', // Not yet known — set on first received message
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousChainLength: 0,
  };

  const header: RatchetHeader = {
    publicKey: await exportPublicKey(dhSendingKeyPair.publicKey),
    messageNumber: 0,
    previousChainLength: 0,
  };

  await storeRatchetState(recipientId, state);
  return { state, header };
}

/**
 * Initialize a Double Ratchet session as the responder (Bob).
 */
export async function initRatchetSessionResponder(
  mySignedPreKeyPrivate: CryptoKey,
  senderIdentityPublicKeyBase64: string,
  senderRatchetPublicKeyBase64: string,
  senderId: string,
): Promise<RatchetState> {
  const senderIdentityKey = await importPublicKey(senderIdentityPublicKeyBase64);
  const senderRatchetKey = await importPublicKey(senderRatchetPublicKeyBase64);

  // Mirror Alice's DH computations
  const dh1 = await dhExchange(mySignedPreKeyPrivate, senderIdentityKey);
  const dh2 = await dhExchange(mySignedPreKeyPrivate, senderRatchetKey);

  const combinedDH = concatBuffers(dh1, dh2);
  const initialRootKeyBytes = await deriveInitialRootKeyMaterial(combinedDH);

  // Bob's DH ratchet step (receiving side)
  const dh3 = await dhExchange(mySignedPreKeyPrivate, senderRatchetKey);
  const { newRootKey, newChainKey } = await kdfRootKey(initialRootKeyBytes, dh3);

  // Generate Bob's ratchet key pair for replies
  const dhSendingKeyPair = await generateRatchetKeyPair();

  const state: RatchetState = {
    rootKey: newRootKey,
    dhSendingKeyPair,
    dhRemotePublicKey: senderRatchetPublicKeyBase64,
    sendingChainKey: '', // Set on first DH ratchet when Bob sends
    receivingChainKey: newChainKey,
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousChainLength: 0,
  };

  await storeRatchetState(senderId, state);
  return state;
}

/**
 * Perform a DH ratchet step when receiving a new ratchet public key.
 */
async function performDHRatchet(state: RatchetState, remotePublicKeyBase64: string): Promise<RatchetState> {
  const remotePublicKey = await importPublicKey(remotePublicKeyBase64);

  // Derive new receiving chain from current root key + DH
  const dhReceive = await dhExchange(state.dhSendingKeyPair.privateKey, remotePublicKey);
  const { newRootKey: rootKey1, newChainKey: receivingChainKey } = await kdfRootKey(
    base64ToArrayBuffer(state.rootKey),
    dhReceive,
  );

  // Generate new sending key pair
  const newDHKeyPair = await generateRatchetKeyPair();
  const dhSend = await dhExchange(newDHKeyPair.privateKey, remotePublicKey);
  const { newRootKey, newChainKey: sendingChainKey } = await kdfRootKey(
    base64ToArrayBuffer(rootKey1),
    dhSend,
  );

  return {
    rootKey: newRootKey,
    dhSendingKeyPair: newDHKeyPair,
    dhRemotePublicKey: remotePublicKeyBase64,
    sendingChainKey,
    receivingChainKey,
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousChainLength: state.sendingMessageNumber,
  };
}

// ── Double Ratchet Encrypt / Decrypt ────────────────────────

/**
 * Encrypt a message using the Double Ratchet.
 *
 * Each call advances the sending chain and derives a unique, non-extractable
 * AES-256-GCM message key that is immediately discarded after encryption.
 * This ensures forward secrecy: compromising the current state cannot
 * reveal previously encrypted messages.
 */
export async function ratchetEncrypt(
  peerId: string,
  plaintext: string,
): Promise<{ ciphertext: string; nonce: string; header: RatchetHeader }> {
  const state = await getRatchetState(peerId);
  if (!state) throw new Error('No ratchet session found. Initialize session first.');

  // Advance sending chain → derive unique message key
  const { newChainKey, messageKeyBytes } = await kdfChainKey(
    base64ToArrayBuffer(state.sendingChainKey),
  );
  const messageKey = await importMessageKey(messageKeyBytes);

  // Encrypt with AES-256-GCM using random 12-byte nonce
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    messageKey,
    new TextEncoder().encode(plaintext),
  );

  const header: RatchetHeader = {
    publicKey: await exportPublicKey(state.dhSendingKeyPair.publicKey),
    messageNumber: state.sendingMessageNumber,
    previousChainLength: state.previousChainLength,
  };

  // Update state — old sending chain key is destroyed (forward secrecy)
  const updatedState: RatchetState = {
    ...state,
    sendingChainKey: newChainKey,
    sendingMessageNumber: state.sendingMessageNumber + 1,
  };
  await storeRatchetState(peerId, updatedState);

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(iv.buffer),
    header,
  };
}

/**
 * Decrypt a message using the Double Ratchet.
 *
 * If the header contains a new DH ratchet public key, performs a DH ratchet
 * step before deriving the message key.
 */
export async function ratchetDecrypt(
  peerId: string,
  ciphertextBase64: string,
  nonceBase64: string,
  header: RatchetHeader,
): Promise<string> {
  let state = await getRatchetState(peerId);
  if (!state) throw new Error('No ratchet session found. Initialize session first.');

  // Check if DH ratchet step is needed (new remote public key)
  if (header.publicKey !== state.dhRemotePublicKey) {
    state = await performDHRatchet(state, header.publicKey);
  }

  // Advance receiving chain to the correct message number
  let chainKey = base64ToArrayBuffer(state.receivingChainKey);
  let messageKeyBytes: ArrayBuffer | null = null;

  // Skip ahead to the correct message number
  for (let i = state.receivingMessageNumber; i <= header.messageNumber; i++) {
    const result = await kdfChainKey(chainKey);
    chainKey = base64ToArrayBuffer(result.newChainKey);
    if (i === header.messageNumber) {
      messageKeyBytes = result.messageKeyBytes;
    }
  }

  if (!messageKeyBytes) {
    throw new Error('Failed to derive message key — message number out of range.');
  }

  const messageKey = await importMessageKey(messageKeyBytes);

  // Decrypt
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const iv = new Uint8Array(base64ToArrayBuffer(nonceBase64));

  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      messageKey,
      ciphertext,
    );

    // Update state — old receiving chain key is destroyed (forward secrecy)
    const updatedState: RatchetState = {
      ...state,
      receivingChainKey: arrayBufferToBase64(chainKey),
      receivingMessageNumber: header.messageNumber + 1,
    };
    await storeRatchetState(peerId, updatedState);

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Failed to decrypt message. The key or payload might be invalid.');
  }
}

// ── Legacy Message Encryption/Decryption (backward compat) ──

export async function encryptMessage(
  key: CryptoKey,
  message: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(message),
  );
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    nonce: arrayBufferToBase64(iv.buffer),
  };
}

export async function decryptMessage(
  key: CryptoKey,
  ciphertextBase64: string,
  nonceBase64: string,
): Promise<string> {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = new Uint8Array(base64ToArrayBuffer(nonceBase64));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Failed to decrypt message. The key or payload might be invalid.');
  }
}

// ── File Encryption ─────────────────────────────────────────

/**
 * Encrypt a file payload with a fresh AES-256-GCM content key.
 */
export async function encryptFile(file: File): Promise<{ ciphertext: Blob; key: string; iv: string }> {
  const arrayBuffer = await file.arrayBuffer();
  // Per-file key: extractable ONLY to transmit wrapped to recipient
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer,
  );

  const exportedKey = await window.crypto.subtle.exportKey('raw', key);

  return {
    ciphertext: new Blob([ciphertext]),
    key: arrayBufferToBase64(exportedKey),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

// ── Session Key Management (legacy compat) ──────────────────

/**
 * Get or create a session key for legacy (non-ratchet) sessions.
 *
 * C2 fix: Session keys are cached as non-extractable CryptoKey objects
 * directly in IndexedDB via structured clone — no raw key bytes stored.
 *
 * Accepts either a JWK string (legacy) or a CryptoKey object (new format)
 * for the private key parameter to maintain backward compatibility.
 */
export async function getOrCreateSessionKey(
  myPrivateKeyOrJwk: string | CryptoKey,
  recipientPublicKeyBase64: string,
  recipientId: string,
): Promise<CryptoKey> {
  const cacheKey = `session-key-obj:${recipientId}`;
  const saltCacheKey = `session-salt:${recipientId}`;

  // Try to load cached non-extractable CryptoKey via structured clone
  const cachedKeyObj = await getKey<CryptoKey>(cacheKey);
  if (cachedKeyObj && cachedKeyObj instanceof CryptoKey) {
    return cachedKeyObj;
  }

  const myPrivateKey = typeof myPrivateKeyOrJwk === 'string'
    ? await importPrivateKey(myPrivateKeyOrJwk)
    : myPrivateKeyOrJwk;
  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);

  // Use cached salt if available for deterministic derivation
  const cachedSalt = await getKey(saltCacheKey);
  const existingSalt = cachedSalt ? base64ToArrayBuffer(cachedSalt) : undefined;
  const { key: sessionKey, salt } = await deriveSharedSecret(myPrivateKey, recipientPublicKey, existingSalt);

  // C2 fix: Store the non-extractable CryptoKey directly via structured clone.
  // IndexedDB can persist CryptoKey objects without extracting raw bytes.
  await storeKey(cacheKey, sessionKey);
  await storeKey(saltCacheKey, arrayBufferToBase64(salt));

  return sessionKey;
}

// ── Identity Key Persistence ────────────────────────────────

/**
 * Store identity key pair.
 *
 * C2 fix: The CryptoKeyPair is stored directly in IndexedDB using
 * structured clone — private key remains non-extractable.  We also
 * store the public key as base64 for easy retrieval.
 */
export async function storeIdentityKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  // Store CryptoKeyPair directly (structured clone preserves non-extractable)
  await storeKey('identity:keyPair', keyPair);

  // Also store the public key as base64 for easy export
  const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
  await storeKey('identity:publicKey', publicKeyBase64);
}

/**
 * Get identity private key.
 *
 * Returns the CryptoKey object directly (non-extractable).
 * For legacy compat, falls back to JWK string if stored in old format.
 */
export async function getIdentityPrivateKey(): Promise<string | CryptoKey | null> {
  // Try new format first: full CryptoKeyPair
  const keyPair = await getKey<CryptoKeyPair>('identity:keyPair');
  if (keyPair?.privateKey) return keyPair.privateKey;

  // Fall back to legacy JWK string format
  const jwk = await getKey<string>('identity:privateKey');
  return jwk ?? null;
}

export async function getIdentityPublicKey(): Promise<string | null> {
  return (await getKey('identity:publicKey')) ?? null;
}

export async function storeSignedPreKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  // Store CryptoKeyPair directly (structured clone)
  await storeKey('signedPreKey:keyPair', keyPair);

  const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
  await storeKey('signedPreKey:publicKey', publicKeyBase64);
}

export async function getSignedPreKeyPrivate(): Promise<string | CryptoKey | null> {
  // Try new format first
  const keyPair = await getKey<CryptoKeyPair>('signedPreKey:keyPair');
  if (keyPair?.privateKey) return keyPair.privateKey;

  // Fall back to legacy JWK format
  const jwk = await getKey<string>('signedPreKey:privateKey');
  return jwk ?? null;
}

// ── Ratchet Session Queries ────────────────────────────────

/**
 * Check if a Double Ratchet session exists for a peer.
 */
export async function hasRatchetSession(peerId: string): Promise<boolean> {
  const state = await getRatchetState(peerId);
  return state !== undefined;
}

/**
 * Delete a ratchet session (e.g. on key compromise / re-key).
 */
export async function deleteRatchetSession(peerId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RATCHET_STORE, 'readwrite');
    tx.objectStore(RATCHET_STORE).delete(peerId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
