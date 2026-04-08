const isProduction = process.env.NODE_ENV === 'production';

const toOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const buildConnectSrc = () => {
  if (!isProduction) return "'self' ws: wss: https:";

  const configuredOrigins = new Set<string>(["'self'"]);
  const addOriginWithSocketVariant = (origin: string) => {
    configuredOrigins.add(origin);
    if (origin.startsWith('https://')) {
      configuredOrigins.add(`wss://${origin.slice('https://'.length)}`);
    }
  };
  const appOrigin = process.env.APP_URL ? toOrigin(process.env.APP_URL) : null;
  if (appOrigin) addOriginWithSocketVariant(appOrigin);

  if (process.env.ALLOWED_ORIGINS) {
    for (const value of process.env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)) {
      const origin = toOrigin(value);
      if (origin) addOriginWithSocketVariant(origin);
    }
  }

  if (process.env.CSP_CONNECT_SRC_EXTRA) {
    for (const value of process.env.CSP_CONNECT_SRC_EXTRA.split(',').map((item) => item.trim()).filter(Boolean)) {
      configuredOrigins.add(value);
    }
  }

  return Array.from(configuredOrigins).join(' ');
};

export const buildContentSecurityPolicy = (nonce?: string) => {
  const nonceDirective = nonce ? `'nonce-${nonce}'` : '';
  const scriptSrc = ["'self'", nonceDirective, ...(isProduction ? [] : ["'unsafe-eval'"])]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    `connect-src ${buildConnectSrc()}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');
};

export const applySecurityHeaders = (headers: Headers, nonce?: string) => {
  const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    ...(isProduction ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    'Content-Security-Policy': buildContentSecurityPolicy(nonce),
  };

  Object.entries(securityHeaders).forEach(([key, value]) => headers.set(key, value));
  if (nonce) {
    headers.set('x-csp-nonce', nonce);
  }
  return headers;
};
