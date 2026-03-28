import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const ADMIN_SETTINGS_ID = '1';

const ADMIN_SETTINGS_COLUMNS_SQL = [
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "isSetupCompleted" BOOLEAN NOT NULL DEFAULT false;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "isRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "maxRegistrations" INTEGER;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "isCaptchaEnabled" BOOLEAN NOT NULL DEFAULT false;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "recaptchaSiteKey" TEXT;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "recaptchaSecretKey" TEXT;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "maxAttachmentSize" INTEGER NOT NULL DEFAULT 10485760;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "allowedFileFormats" TEXT NOT NULL DEFAULT \'*\';',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "reservedUsernames" TEXT NOT NULL DEFAULT \'admin,administrator,support,moderator,root,sys\';',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "rules" TEXT;',
  'ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "firebaseConfig" TEXT;',
];

const isAdminSettingsSchemaMismatch = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021' && error.code !== 'P2022') return false;

  const table = (error.meta as { table?: unknown } | undefined)?.table;
  const column = (error.meta as { column?: unknown } | undefined)?.column;

  const tableMatch = typeof table === 'string' && table.includes('AdminSettings');
  const columnMatch = typeof column === 'string'
    && [
      'isSetupCompleted',
      'isRegistrationEnabled',
      'maxRegistrations',
      'isCaptchaEnabled',
      'recaptchaSiteKey',
      'recaptchaSecretKey',
      'maxAttachmentSize',
      'allowedFileFormats',
      'reservedUsernames',
      'rules',
      'firebaseConfig',
    ].some((name) => column.includes(name));

  return tableMatch || columnMatch;
};

let adminSettingsSchemaEnsured = false;

async function ensureAdminSettingsSchema() {
  if (adminSettingsSchemaEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminSettings" (
      "id" TEXT NOT NULL DEFAULT '1',
      "isSetupCompleted" BOOLEAN NOT NULL DEFAULT false,
      "isRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
      "maxRegistrations" INTEGER,
      "isCaptchaEnabled" BOOLEAN NOT NULL DEFAULT false,
      "recaptchaSiteKey" TEXT,
      "recaptchaSecretKey" TEXT,
      "maxAttachmentSize" INTEGER NOT NULL DEFAULT 10485760,
      "allowedFileFormats" TEXT NOT NULL DEFAULT '*',
      "reservedUsernames" TEXT NOT NULL DEFAULT 'admin,administrator,support,moderator,root,sys',
      "rules" TEXT,
      "firebaseConfig" TEXT,
      CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
    );
  `);

  for (const statement of ADMIN_SETTINGS_COLUMNS_SQL) {
    await prisma.$executeRawUnsafe(statement);
  }

  adminSettingsSchemaEnsured = true;
}

export async function getOrCreateAdminSettings() {
  // Default settings for first-run installations.
  // isCaptchaEnabled defaults to false so that users can log in immediately
  // after a fresh install without requiring captcha configuration.
  // Administrators can enable captcha from the admin panel once the app is running.
  const defaultSettings = {
    id: ADMIN_SETTINGS_ID,
    isCaptchaEnabled: false,
    isRegistrationEnabled: true,
  };

  try {
    let settings = await prisma.adminSettings.findUnique({ where: { id: ADMIN_SETTINGS_ID } });
    if (!settings) {
      settings = await prisma.adminSettings.create({ data: defaultSettings });
    }
    return settings;
  } catch (error) {
    if (!isAdminSettingsSchemaMismatch(error)) throw error;

    logger.warn('AdminSettings schema mismatch detected. Applying runtime compatibility patch.');
    await ensureAdminSettingsSchema();

    let settings = await prisma.adminSettings.findUnique({ where: { id: ADMIN_SETTINGS_ID } });
    if (!settings) {
      settings = await prisma.adminSettings.create({ data: defaultSettings });
    }
    return settings;
  }
}

export async function upsertAdminSettings(update: Record<string, unknown>) {
  try {
    return await prisma.adminSettings.upsert({
      where: { id: ADMIN_SETTINGS_ID },
      update,
      create: { id: ADMIN_SETTINGS_ID, ...update },
    });
  } catch (error) {
    if (!isAdminSettingsSchemaMismatch(error)) throw error;

    logger.warn('AdminSettings schema mismatch detected during upsert. Applying runtime compatibility patch.');
    await ensureAdminSettingsSchema();

    return prisma.adminSettings.upsert({
      where: { id: ADMIN_SETTINGS_ID },
      update,
      create: { id: ADMIN_SETTINGS_ID, ...update },
    });
  }
}
