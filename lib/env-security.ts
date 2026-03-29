import fs from 'fs';

const MIN_SECRET_LENGTH = 32;

const requireEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const getBootstrapAdminPassword = () => {
  const inline = process.env.ADMIN_PASSWORD?.trim();
  if (inline) return inline;

  const filePath = process.env.ADMIN_BOOTSTRAP_PASSWORD_FILE?.trim();
  if (!filePath) return '';
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    throw new Error(`ADMIN_BOOTSTRAP_PASSWORD_FILE could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const forbidWeakValue = (name: string, value: string, denied: string[]) => {
  if (denied.includes(value)) {
    throw new Error(`${name} uses a weak default value and must be rotated.`);
  }
};

const requireMinLength = (name: string, value: string, minLength = MIN_SECRET_LENGTH) => {
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long.`);
  }
};


const forbidPlaceholderPattern = (name: string, value: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    if (pattern.test(value)) {
      throw new Error(`${name} uses a placeholder value and must be rotated.`);
    }
  }
};

export const validateProductionEnvironment = () => {
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
  const isProduction = appEnv === 'production';

  if (!isProduction) {
    return { appEnv, isProduction: false };
  }

  const jwtSecret = requireEnv('JWT_SECRET');
  const sessionSecret = requireEnv('SESSION_SECRET');
  const encryptionKey = requireEnv('ENCRYPTION_KEY');
  const adminPassword = getBootstrapAdminPassword();
  const downloadTokenSecret = requireEnv('DOWNLOAD_TOKEN_SECRET');
  const appDbPassword = requireEnv('APP_DB_PASSWORD');
  const databaseUrl = requireEnv('DATABASE_URL');
  const adminUsername = requireEnv('ADMIN_USERNAME');
  requireEnv('APP_URL');
  requireEnv('ALLOWED_ORIGINS');
  requireEnv('APP_DB_USER');
  // MinIO credentials are optional.  If MINIO_ENDPOINT is set, require
  // access key and secret; otherwise skip these checks.  This allows the
  // server to run without object storage configured (defaulting to local
  // filesystem storage).
  const minioEndpoint = process.env.MINIO_ENDPOINT;
  if (minioEndpoint) {
    requireEnv('MINIO_ACCESS_KEY');
    requireEnv('MINIO_SECRET_KEY');
  }

  requireMinLength('JWT_SECRET', jwtSecret);
  requireMinLength('SESSION_SECRET', sessionSecret);
  requireMinLength('ENCRYPTION_KEY', encryptionKey);
  requireMinLength('APP_DB_PASSWORD', appDbPassword, 16);
  requireMinLength('DOWNLOAD_TOKEN_SECRET', downloadTokenSecret);
  if (adminPassword) {
    requireMinLength('ADMIN_PASSWORD', adminPassword, 16);
  }
  if (minioEndpoint) {
    const minioSecret = process.env.MINIO_SECRET_KEY!;
    requireMinLength('MINIO_SECRET_KEY', minioSecret, 16);
  }

  if (adminPassword) {
    forbidWeakValue('ADMIN_PASSWORD', adminPassword, ['admin', 'changeme', 'password', 'change_this_admin_password']);
  }
  forbidWeakValue('APP_DB_PASSWORD', appDbPassword, ['pass', 'postgres', 'password']);

  forbidPlaceholderPattern('JWT_SECRET', jwtSecret, [/^__change_me/i, /^your-super-secret-jwt-key-change-this-in-production$/i]);
  forbidPlaceholderPattern('ENCRYPTION_KEY', encryptionKey, [/^__change_me/i, /^your-32-character-encryption-key$/i]);
  forbidPlaceholderPattern('SESSION_SECRET', sessionSecret, [/^__change_me/i, /^replace-with-32-plus-char-secret$/i]);
  forbidPlaceholderPattern('DOWNLOAD_TOKEN_SECRET', downloadTokenSecret, [/^__change_me/i, /^replace-with-32-plus-char-secret$/i]);
  if (adminPassword) {
    forbidPlaceholderPattern('ADMIN_PASSWORD', adminPassword, [/^__change_me/i, /^replace-with-strong-admin-password$/i]);
  }
  forbidPlaceholderPattern('DATABASE_URL', databaseUrl, [/__db_/i, /:\/\/[^:]+:__[^@]+__@/i, /__set_me/i]);
  forbidPlaceholderPattern('ADMIN_USERNAME', adminUsername, [/^admin$/i, /^__set_me/i]);
  if (databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL cannot use SQLite in production.');
  }
  const captchaProvider = (process.env.CAPTCHA_PROVIDER ?? 'recaptcha').trim().toLowerCase();
  if (captchaProvider === 'local') {
    const localCaptchaSecret = requireEnv('LOCAL_CAPTCHA_SECRET');
    requireMinLength('LOCAL_CAPTCHA_SECRET', localCaptchaSecret, 32);
    forbidPlaceholderPattern('LOCAL_CAPTCHA_SECRET', localCaptchaSecret, [/^replace-with/i, /^__change_me/i]);
  }
  if (minioEndpoint) {
    const minioSecret = process.env.MINIO_SECRET_KEY!;
    forbidWeakValue('MINIO_SECRET_KEY', minioSecret, ['supersecret', 'minioadmin', 'password']);
  }

  return { appEnv, isProduction: true };
};
