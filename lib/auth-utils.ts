import { prisma } from './prisma';
import argon2 from 'argon2';
import crypto from 'crypto';
import { logger } from './logger';

export async function initializeAdmin() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
    let adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      adminPassword = crypto.randomBytes(18).toString('base64url');
      logger.warn('ADMIN_PASSWORD not set. A temporary password was generated and persisted locally. Rotate it immediately after first login.', { adminUsername });
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
      const passwordHash = await argon2.hash(adminPassword);
      await prisma.user.create({
        data: {
          username: adminUsername,
          numericId: '0000000000',
          passwordHash,
          role: 'ADMIN',
          isApproved: true,
          needsPasswordChange: true,
          identityKeyPublic: 'default_admin_key',
          signedPreKey: 'default_admin_key',
          signedPreKeySig: 'default_admin_key',
        },
      });
      logger.info('Default admin created successfully.', { adminUsername });
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
