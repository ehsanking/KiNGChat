import type { SessionData } from '@/lib/session';

const SESSION_COOKIE_NAME = 'elahe_session';

const textEncoder = new TextEncoder();

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET or JWT_SECRET with at least 32 characters is required.');
  }
  return secret;
};

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

const decodeBase64UrlText = (value: string) => new TextDecoder().decode(base64UrlToUint8Array(value));

const toBase64Url = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.byteLength; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const getHmacSignature = async (payload: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return toBase64Url(signature);
};

const sha256Hex = async (value: string | null | undefined) => {
  if (!value) return null;
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

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

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = await getHmacSignature(payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const session = JSON.parse(decodeBase64UrlText(payload)) as SessionData;
    if (!session.userId || session.expiresAt <= Date.now()) return null;

    if (session.userAgentHash && session.userAgentHash !== await sha256Hex(requestContext?.userAgent)) return null;
    if (session.ipHash && session.ipHash !== await sha256Hex(requestContext?.ip)) return null;

    if (!session.issuedAt) session.issuedAt = Date.now();
    if (!session.sessionVersion) session.sessionVersion = 1;

    return session;
  } catch {
    return null;
  }
};
