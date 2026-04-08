import type { SessionData } from '@/lib/session';

const SESSION_COOKIE_NAME = 'elahe_session';

/**
 * Session token version.  Must match the version in lib/session.ts.
 */
const TOKEN_VERSION = 2;

const textEncoder = new TextEncoder();

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET with at least 32 characters is required.');
  }
  return secret;
};

// ── Key derivation (mirrors lib/session.ts) ─────────────────
// We derive separate encryption and signing keys from SESSION_SECRET
// using HMAC-based key derivation to avoid using the raw secret for
// two different purposes.

async function deriveKey(purpose: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, textEncoder.encode(purpose));
}

let _encKeyPromise: Promise<ArrayBuffer> | null = null;
let _sigKeyPromise: Promise<ArrayBuffer> | null = null;

function getEncryptionKey(): Promise<ArrayBuffer> {
  if (!_encKeyPromise) _encKeyPromise = deriveKey('elahe-session-enc-v2');
  return _encKeyPromise;
}

function getSigningKey(): Promise<ArrayBuffer> {
  if (!_sigKeyPromise) _sigKeyPromise = deriveKey('elahe-session-sig-v2');
  return _sigKeyPromise;
}

// ── base64url helpers ───────────────────────────────────────

const base64UrlToUint8Array = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const toBase64Url = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.byteLength; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64UrlText = (value: string) =>
  new TextDecoder().decode(base64UrlToUint8Array(value));

// ── Crypto operations (Edge-compatible WebCrypto) ───────────

async function hmacVerify(key: ArrayBuffer, data: string, signatureB64: string): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const signatureBytes = base64UrlToUint8Array(signatureB64);
  return crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, textEncoder.encode(data));
}

async function aesGcmDecrypt(
  key: ArrayBuffer, ivB64: string, ciphertextB64: string, tagB64: string,
): Promise<string | null> {
  try {
    const iv = base64UrlToUint8Array(ivB64);
    const ciphertext = base64UrlToUint8Array(ciphertextB64);
    const tag = base64UrlToUint8Array(tagB64);

    // WebCrypto AES-GCM expects ciphertext + tag concatenated
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      cryptoKey,
      combined,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

const sha256Hex = async (value: string | null | undefined) => {
  if (!value) return null;
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// ── Timing-safe string comparison ───────────────────────────

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

// ── Session validation ──────────────────────────────────────

async function validateSessionData(
  session: SessionData,
  requestContext?: { userAgent?: string | null; ip?: string | null },
): Promise<SessionData | null> {
  if (!session.userId || session.expiresAt <= Date.now()) return null;
  if (session.userAgentHash && session.userAgentHash !== await sha256Hex(requestContext?.userAgent)) return null;
  if (session.ipHash && session.ipHash !== await sha256Hex(requestContext?.ip)) return null;
  if (!session.issuedAt) session.issuedAt = Date.now();
  if (!session.sessionVersion) session.sessionVersion = 1;
  return session;
}

// ── Legacy v1 token verification ────────────────────────────

async function verifyLegacyToken(
  payload: string,
  signature: string,
  requestContext?: { userAgent?: string | null; ip?: string | null },
): Promise<SessionData | null> {
  // Legacy signing used raw SESSION_SECRET
  const key = await crypto.subtle.importKey(
    'raw', textEncoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  const expectedStr = toBase64Url(expected);
  if (!safeEqual(signature, expectedStr)) return null;

  try {
    const session = JSON.parse(decodeBase64UrlText(payload)) as SessionData;
    return validateSessionData(session, requestContext);
  } catch {
    return null;
  }
}

// ── Main export ─────────────────────────────────────────────

export const getSessionFromCookieHeaderEdge = async (
  cookieHeader: string | undefined | null,
  requestContext?: { userAgent?: string | null; ip?: string | null },
): Promise<SessionData | null> => {
  if (!cookieHeader) return null;

  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (!token) return null;

  const parts = token.split('.');

  // v2 (encrypt-then-sign): version.iv.ciphertext.tag.signature
  if (parts.length === 5) {
    const [version, iv, ciphertext, tag, signature] = parts;
    if (!version || !iv || !ciphertext || !tag || !signature) return null;
    if (version !== String(TOKEN_VERSION)) return null;

    // Verify signature first (timing-safe via WebCrypto)
    const sigKey = await getSigningKey();
    const dataToVerify = `${version}.${iv}.${ciphertext}.${tag}`;
    const valid = await hmacVerify(sigKey, dataToVerify, signature);
    if (!valid) return null;

    // Decrypt payload
    const encKey = await getEncryptionKey();
    const plaintext = await aesGcmDecrypt(encKey, iv, ciphertext, tag);
    if (!plaintext) return null;

    try {
      const session = JSON.parse(plaintext) as SessionData;
      return validateSessionData(session, requestContext);
    } catch {
      return null;
    }
  }

  // Legacy v1 (sign-only): payload.signature — graceful migration
  if (parts.length === 2) {
    const [payload, signature] = parts;
    if (!payload || !signature) return null;
    return verifyLegacyToken(payload, signature, requestContext);
  }

  return null;
};
