import { prisma } from './prisma';
import argon2 from 'argon2';
import { logger } from './logger';

export async function initializeAdmin() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    if (!adminUsername) {
      logger.warn('ADMIN_USERNAME is not configured. Skipping admin bootstrap.');
      return;
    }
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      logger.warn('ADMIN_PASSWORD is not configured. Skipping admin bootstrap to avoid insecure defaults.', { adminUsername });
      return;
    }

    const adminExists = await prisma.user.findFirst({
      where: {
        OR: [
          { username: adminUsername },
          { numericId: '0000000000' }
        ]
      },
    });

    if (!adminExists) {
      const bootstrapForcePasswordChange = (process.env.ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE ?? 'true').toLowerCase() === 'true';
      const passwordHash = await argon2.hash(adminPassword);
      await prisma.user.create({
        data: {
          username: adminUsername,
          numericId: '0000000000',
          passwordHash,
          role: 'ADMIN',
          isApproved: true,
          needsPasswordChange: bootstrapForcePasswordChange,
          // Bootstrap admin accounts are created without E2EE identity material by design.
          // Keys are expected to be provisioned from the client on first authenticated use.
          identityKeyPublic: '',
          signedPreKey: '',
          signedPreKeySig: '',
        },
      });
      logger.info('Bootstrap admin created successfully.', { adminUsername, bootstrapForcePasswordChange });
    } else {
      logger.info('Admin user already exists.');
    }
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      logger.info('Admin user already created by another process.');
    } else {
      // Log but do NOT rethrow — a crash here would prevent the server from starting
      logger.error('Failed to initialize admin.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
