import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const ADMIN_SETTINGS_ID = '1';

const isMissingAdminSettingsTableError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021') return false;
  const table = (error.meta as { table?: unknown } | undefined)?.table;
  return typeof table === 'string' && table.includes('AdminSettings');
};

async function createAdminSettingsTableIfMissing() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdminSettings" (
      "id" TEXT NOT NULL DEFAULT '1',
      "isSetupCompleted" BOOLEAN NOT NULL DEFAULT false,
      "isRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
      "maxRegistrations" INTEGER,
      "isCaptchaEnabled" BOOLEAN NOT NULL DEFAULT true,
      "maxAttachmentSize" INTEGER NOT NULL DEFAULT 10485760,
      "allowedFileFormats" TEXT NOT NULL DEFAULT '*',
      "reservedUsernames" TEXT NOT NULL DEFAULT 'admin,administrator,support,moderator,root,sys',
      "rules" TEXT,
      "firebaseConfig" TEXT,
      CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
    );
  `);
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
    if (!isMissingAdminSettingsTableError(error)) throw error;

    logger.warn('AdminSettings table missing. Creating table at runtime fallback path.');
    await createAdminSettingsTableIfMissing();

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
    if (!isMissingAdminSettingsTableError(error)) throw error;

    logger.warn('AdminSettings table missing during upsert. Creating table at runtime fallback path.');
    await createAdminSettingsTableIfMissing();

    return prisma.adminSettings.upsert({
      where: { id: ADMIN_SETTINGS_ID },
      update,
      create: { id: ADMIN_SETTINGS_ID, ...update },
    });
  }
}
