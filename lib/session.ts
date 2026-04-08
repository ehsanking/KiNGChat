import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'elahe_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
/**
 * Session rotation interval: tokens older than this are automatically
 * rotated on the next request to limit the window of a stolen token.
 */
const SESSION_ROTATION_MS = Number(process.env.SESSION_ROTATION_MS) || 1000 * 60 * 60; // 1 hour

/**
 * Session token version.  Increment when the token format changes to
 * automatically reject tokens produced by older code.
 */
const TOKEN_VERSION = 2;

export type SessionData = {
  userId: string;
  role: string;
  needsPasswordChange: boolean;
  csrfToken: string;
  issuedAt: number;
  sessionVersion: number;
  userAgentHash?: string | null;
  ipHash?: string | null;
  expiresAt: number;
};

export type SessionUserLike = Pick<SessionData, 'userId' | 'role' | 'needsPasswordChange' | 'sessionVersion'>;

// ── Key derivation ──────────────────────────────────────────
// Derive separate encryption and signing keys from SESSION_SECRET using
// HKDF to avoid using the raw secret directly for two different purposes.

const getSessionSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET with at least 32 characters is required.');
  }
  return secret;
};

let _encKey: Buffer | null = null;
let _sigKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_encKey) return _encKey;
  _encKey = crypto.createHmac('sha256', getSessionSecret()).update('elahe-session-enc-v2').digest();
  return _encKey;
}

function getSigningKey(): Buffer {
  if (_sigKey) return _sigKey;
  _sigKey = crypto.createHmac('sha256', getSessionSecret()).update('elahe-session-sig-v2').digest();
  return _sigKey;
}

// ── Helpers ──────────────────────────────────────────────────

const base64UrlEncode = (value: Buffer): string =>
  value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
};

const hashOptionalValue = (value: string | null | undefined): string | null =>
  value ? crypto.createHash('sha256').update(value).digest('hex') : null;

// ── Encrypt-then-Sign ─────────────────────────────────────
//
// C3 fix: Session tokens are now AES-256-GCM encrypted THEN HMAC-SHA256
// signed.  The payload (userId, role, csrfToken, etc.) is never visible
// in the cookie, preventing information leakage from stolen cookies.
//
// Token format: version.iv.ciphertext.tag.signature
//   - version: token format version (1 byte, encoded)
//   - iv: 12-byte random initialisation vector (base64url)
//   - ciphertext: AES-256-GCM encrypted JSON payload (base64url)
//   - tag: 16-byte GCM authentication tag (base64url)
//   - signature: HMAC-SHA256 over "version.iv.ciphertext.tag" (base64url)

function encryptPayload(plaintext: string): { iv: string; ciphertext: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(encrypted),
    tag: base64UrlEncode(tag),
  };
}

function decryptPayload(ivB64: string, ciphertextB64: string, tagB64: string): string | null {
  try {
    const iv = base64UrlDecode(ivB64);
    const ciphertext = base64UrlDecode(ciphertextB64);
    const tag = base64UrlDecode(tagB64);

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function signToken(data: string): string {
  const sig = crypto.createHmac('sha256', getSigningKey()).update(data).digest();
  return base64UrlEncode(sig);
}

function verifySignature(data: string, signatureB64: string): boolean {
  const expected = crypto.createHmac('sha256', getSigningKey()).update(data).digest();
  const provided = base64UrlDecode(signatureB64);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

// ── Token creation / verification ────────────────────────────

/**
 * Create an encrypted-and-signed session token from authenticated user data.
 */
export const createSessionToken = (user: SessionUserLike, requestContext?: { userAgent?: string | null; ip?: string | null }): string => {
  const session: SessionData = {
    ...user,
    csrfToken: crypto.randomBytes(24).toString('hex'),
    issuedAt: Date.now(),
    sessionVersion: user.sessionVersion,
    userAgentHash: hashOptionalValue(requestContext?.userAgent),
    ipHash: process.env.SESSION_BIND_IP === 'true' ? hashOptionalValue(requestContext?.ip) : null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  const plaintext = JSON.stringify(session);
  const { iv, ciphertext, tag } = encryptPayload(plaintext);
  const version = String(TOKEN_VERSION);
  const dataToSign = `${version}.${iv}.${ciphertext}.${tag}`;
  const signature = signToken(dataToSign);

  return `${dataToSign}.${signature}`;
};

export const verifySessionToken = (token: string | undefined | null, requestContext?: { userAgent?: string | null; ip?: string | null }): SessionData | null => {
  if (!token) return null;

  const parts = token.split('.');

  // Support v2 (encrypt-then-sign) format: version.iv.ciphertext.tag.signature
  if (parts.length === 5) {
    const [version, iv, ciphertext, tag, signature] = parts;
    if (!version || !iv || !ciphertext || !tag || !signature) return null;

    // Reject unknown token versions
    if (version !== String(TOKEN_VERSION)) return null;

    // Verify signature first (timing-safe)
    const dataToVerify = `${version}.${iv}.${ciphertext}.${tag}`;
    if (!verifySignature(dataToVerify, signature)) return null;

    // Decrypt payload
    const plaintext = decryptPayload(iv, ciphertext, tag);
    if (!plaintext) return null;

    try {
      const session = JSON.parse(plaintext) as SessionData;
      return validateSessionData(session, requestContext);
    } catch {
      return null;
    }
  }

  // Legacy v1 format support (sign-only): payload.signature
  // Allows graceful migration — old tokens still work until they expire.
  if (parts.length === 2) {
    const [payload, signature] = parts;
    if (!payload || !signature) return null;

    // Legacy signing used raw SESSION_SECRET
    const legacySign = (data: string) =>
      base64UrlEncode(crypto.createHmac('sha256', getSessionSecret()).update(data).digest());

    const expected = legacySign(payload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return null;
    }

    try {
      const decoded = base64UrlDecode(payload).toString('utf8');
      const session = JSON.parse(decoded) as SessionData;
      return validateSessionData(session, requestContext);
    } catch {
      return null;
    }
  }

  return null;
};

function validateSessionData(
  session: SessionData,
  requestContext?: { userAgent?: string | null; ip?: string | null },
): SessionData | null {
  if (!session.userId || session.expiresAt <= Date.now()) {
    return null;
  }
  if (session.userAgentHash && session.userAgentHash !== hashOptionalValue(requestContext?.userAgent)) {
    return null;
  }
  if (session.ipHash && session.ipHash !== hashOptionalValue(requestContext?.ip)) {
    return null;
  }
  if (!session.issuedAt) {
    session.issuedAt = Date.now();
  }
  if (!session.sessionVersion) {
    session.sessionVersion = 1;
  }
  return session;
}

// ── Cookie helpers ───────────────────────────────────────────

/**
 * Resolve whether session cookies must be marked as Secure.
 */
export const getSessionCookieSecureFlag = (): boolean => {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === 'https:';
    } catch {
      return process.env.NODE_ENV === 'production';
    }
  }
  return process.env.NODE_ENV === 'production';
};

const getCookieOptions = (expiresAt: number): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  expires: Date;
} => ({
  httpOnly: true,
  secure: getSessionCookieSecureFlag(),
  sameSite: 'strict' as const,
  path: '/',
  expires: new Date(expiresAt),
});

/**
 * Issue a new session cookie and return the validated session payload.
 */
export const issueSession = (response: NextResponse, user: SessionUserLike, requestContext?: { userAgent?: string | null; ip?: string | null }): SessionData => {
  const token = createSessionToken(user, requestContext);
  const session = verifySessionToken(token, requestContext);
  if (!session) throw new Error('Failed to create session.');
  response.cookies.set(SESSION_COOKIE_NAME, token, getCookieOptions(session.expiresAt));
  return session;
};

/**
 * Check whether a session token needs to be rotated based on its issuedAt
 * timestamp.  Returns true if the token is older than SESSION_ROTATION_MS.
 */
export const shouldRotateSession = (session: SessionData): boolean => {
  if (!session.issuedAt) return true;
  return Date.now() - session.issuedAt > SESSION_ROTATION_MS;
};

/**
 * Rotate the current session by issuing a fresh token and cookie.
 */
export const rotateSession = (response: NextResponse, session: SessionData, requestContext?: { userAgent?: string | null; ip?: string | null }): SessionData => {
  const user: SessionUserLike = {
    userId: session.userId,
    role: session.role,
    needsPasswordChange: session.needsPasswordChange,
    sessionVersion: session.sessionVersion,
  };
  return issueSession(response, user, requestContext);
};

/**
 * Clear the session cookie by expiring it immediately.
 */
export const clearSession = (response: NextResponse): void => {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: getSessionCookieSecureFlag(),
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
  });
};

/**
 * Parse and verify session data from a raw Cookie header value.
 */
export const getSessionFromCookieHeader = (cookieHeader: string | undefined | null, requestContext?: { userAgent?: string | null; ip?: string | null }): SessionData | null => {
  if (!cookieHeader) return null;
  const cookieValue = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  return verifySessionToken(cookieValue, requestContext);
};

/**
 * Resolve session data directly from a Request/NextRequest object.
 */
export const getSessionFromRequest = (request: Request | NextRequest): SessionData | null => {
  const cookieHeader =
    'headers' in request && typeof request.headers?.get === 'function'
      ? request.headers.get('cookie')
      : null;
  const userAgent = request.headers.get('user-agent');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip');
  return getSessionFromCookieHeader(cookieHeader, { userAgent, ip });
};
