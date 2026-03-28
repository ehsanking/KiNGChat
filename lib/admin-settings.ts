import { prisma } from '@/lib/prisma';

const ADMIN_SETTINGS_ID = '1';

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

  let settings = await prisma.adminSettings.findUnique({ where: { id: ADMIN_SETTINGS_ID } });
  if (!settings) {
    settings = await prisma.adminSettings.create({ data: defaultSettings });
  }
  return settings;
}

export async function upsertAdminSettings(update: Record<string, unknown>) {
  return prisma.adminSettings.upsert({
    where: { id: ADMIN_SETTINGS_ID },
    update,
    create: { id: ADMIN_SETTINGS_ID, ...update },
  });
}
