const MIN_SECRET_LENGTH = 32;

const requireEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
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
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const postgresPassword = requireEnv('POSTGRES_PASSWORD');
  const databaseUrl = requireEnv('DATABASE_URL');
  const adminUsername = requireEnv('ADMIN_USERNAME');
  requireEnv('APP_URL');
  requireEnv('ALLOWED_ORIGINS');
  requireEnv('POSTGRES_USER');
  requireEnv('POSTGRES_DB');
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
  requireMinLength('ADMIN_PASSWORD', adminPassword, 16);
  requireMinLength('POSTGRES_PASSWORD', postgresPassword, 16);
  if (minioEndpoint) {
    const minioSecret = process.env.MINIO_SECRET_KEY!;
    requireMinLength('MINIO_SECRET_KEY', minioSecret, 16);
  }

  forbidWeakValue('ADMIN_PASSWORD', adminPassword, ['admin', 'changeme', 'password', 'change_this_admin_password']);
  forbidWeakValue('POSTGRES_PASSWORD', postgresPassword, ['pass', 'postgres', 'password']);

  forbidPlaceholderPattern('JWT_SECRET', jwtSecret, [/^__change_me/i, /^your-super-secret-jwt-key-change-this-in-production$/i]);
  forbidPlaceholderPattern('ENCRYPTION_KEY', encryptionKey, [/^__change_me/i, /^your-32-character-encryption-key$/i]);
  forbidPlaceholderPattern('SESSION_SECRET', sessionSecret, [/^__change_me/i, /^replace-with-32-plus-char-secret$/i]);
  forbidPlaceholderPattern('ADMIN_PASSWORD', adminPassword, [/^__change_me/i, /^replace-with-strong-admin-password$/i]);
  forbidPlaceholderPattern('DATABASE_URL', databaseUrl, [/__db_/i, /:\/\/[^:]+:__[^@]+__@/i, /__set_me/i]);
  forbidPlaceholderPattern('ADMIN_USERNAME', adminUsername, [/^admin$/i, /^__set_me/i]);
  if (minioEndpoint) {
    const minioSecret = process.env.MINIO_SECRET_KEY!;
    forbidWeakValue('MINIO_SECRET_KEY', minioSecret, ['supersecret', 'minioadmin', 'password']);
  }

  return { appEnv, isProduction: true };
};
