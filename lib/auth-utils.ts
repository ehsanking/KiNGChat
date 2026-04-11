import { prisma } from './prisma';
import * as argon2 from '@node-rs/argon2';
import { logger } from './logger';
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import fs from 'fs';

const getAdminBootstrapStateFile = () => {
  const stateDir = process.env.ADMIN_BOOTSTRAP_STATE_DIR || '/app/runtime_state';
  const absoluteStateDir = path.isAbsolute(stateDir) ? stateDir : path.join(process.cwd(), stateDir);
  return path.join(absoluteStateDir, 'admin-bootstrap-reset-state');
};

const makeResetStateFingerprint = async (username: string, password: string, forcePasswordChange: boolean) => {
  const input = `${username}\n${password}\n${forcePasswordChange ? 'force' : 'noforce'}`;
  // Use Argon2 as a computationally expensive KDF to derive the fingerprint from the password.
  return argon2.hash(input);
};

async function hasConsumedAdminReset(fingerprint: string) {
  const stateFile = getAdminBootstrapStateFile();
  try {
    const existing = (await readFile(stateFile, 'utf8')).trim();
    return existing === fingerprint;
  } catch {
    return false;
  }
}

async function markAdminResetConsumed(fingerprint: string) {
  const stateFile = getAdminBootstrapStateFile();
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${fingerprint}\n`, { mode: 0o600 });
}

export async function initializeAdmin() {
  const result = {
    ok: true,
    action: 'noop' as 'created' | 'reset' | 'exists' | 'skipped' | 'noop' | 'failed',
    reason: '' as string | undefined,
  };

  const resolveBootstrapPassword = () => {
    const inlinePassword = process.env.ADMIN_PASSWORD?.trim();
    if (inlinePassword) return inlinePassword;

    const passwordFile = process.env.ADMIN_BOOTSTRAP_PASSWORD_FILE?.trim();
    if (!passwordFile) return '';
    try {
      const fileContent = fs.readFileSync(passwordFile, 'utf8').trim();
      return fileContent;
    } catch (error) {
      throw new Error(`Failed to read ADMIN_BOOTSTRAP_PASSWORD_FILE at ${passwordFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    if (!adminUsername) {
      logger.warn('ADMIN_USERNAME is not configured. Skipping admin bootstrap.');
      result.action = 'skipped';
      result.reason = 'ADMIN_USERNAME is not configured';
      return result;
    }
    const adminPassword = resolveBootstrapPassword();

    if (!adminPassword) {
      logger.info('No bootstrap admin password source is configured. Skipping admin bootstrap.', { adminUsername });
      result.action = 'skipped';
      result.reason = 'No bootstrap password source configured';
      return result;
    }

    const adminExists = await prisma.user.findFirst({
      where: {
        OR: [
          { username: adminUsername },
          { numericId: '0000000000' }
        ]
      },
    });
    const allowResetExisting = (process.env.ADMIN_BOOTSTRAP_RESET_EXISTING ?? 'false').toLowerCase() === 'true';
    const bootstrapForcePasswordChange = (process.env.ADMIN_BOOTSTRAP_FORCE_PASSWORD_CHANGE ?? 'true').toLowerCase() === 'true';
    const resetStateFingerprint = await makeResetStateFingerprint(adminUsername, adminPassword, bootstrapForcePasswordChange);
    const resetAlreadyConsumed = allowResetExisting ? await hasConsumedAdminReset(resetStateFingerprint) : false;

    if (!adminExists) {
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
      result.action = 'created';
    } else if (allowResetExisting && !resetAlreadyConsumed) {
      const passwordHash = await argon2.hash(adminPassword);
      await prisma.user.update({
        where: { id: adminExists.id },
        data: {
          username: adminUsername,
          role: 'ADMIN',
          isApproved: true,
          passwordHash,
          needsPasswordChange: bootstrapForcePasswordChange,
        },
      });
      logger.warn('Existing admin credentials were reset from env because ADMIN_BOOTSTRAP_RESET_EXISTING=true.', {
        adminUsername,
        existingAdminId: adminExists.id,
        bootstrapForcePasswordChange,
      });
      await markAdminResetConsumed(resetStateFingerprint);
      result.action = 'reset';
    } else if (allowResetExisting && resetAlreadyConsumed) {
      logger.info('Admin reset flag already consumed for current bootstrap credentials; skipping repeated reset.', {
        adminUsername,
      });
      result.action = 'exists';
    } else {
      logger.info('Admin user already exists. Env bootstrap credentials are create-only and were not applied.', {
        adminUsername,
        existingAdminId: adminExists.id,
        allowResetExisting,
      });
      result.action = 'exists';
    }
    return result;
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      logger.info('Admin user already created by another process.');
      result.action = 'exists';
      return result;
    } else {
      logger.error('Failed to initialize admin.', {
        error: error instanceof Error ? error.message : String(error),
      });
      result.ok = false;
      result.action = 'failed';
      result.reason = error instanceof Error ? error.message : String(error);
      return result;
    }
  }
}
