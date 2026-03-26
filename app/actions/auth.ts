'use server';

import { prisma } from '@/lib/prisma';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';
import { getOrSetCache, invalidateCache } from '@/lib/cache';
import { countFailedIpAttempts, createLoginAttempt } from '@/lib/login-attempts';
import { getMessageHistoryExtended, syncConversation, markMessagesDelivered, toggleReaction, editMessage, saveDraft, listDrafts, deleteDraft, searchMessages } from '@/lib/messaging-service';
import { rateLimit } from '@/lib/rate-limit';
import { generateCaptchaText, generateCaptchaSvg } from '@/lib/captcha';
import { createCaptchaChallengeResilient, verifyCaptchaChallengeResilient } from '@/lib/captcha-store';
import argon2 from 'argon2';
import { headers, cookies } from 'next/headers';
import os from 'os';
import fs from 'fs';
import { getOnlineUsersCount } from '@/lib/presence';
// Import admin-specific server actions from admin.ts to reduce duplication.
import {
  getAllUsers as adminGetAllUsers,
  toggleBanUser as adminToggleBanUser,
  updateUserBadges as adminUpdateUserBadges,
  getAdminSettings as adminGetAdminSettings,
  updateAdminSettings as adminUpdateAdminSettings,
  getAuditLogs as adminGetAuditLogs,
  exportSystemData as adminExportSystemData,
  getAllReports as adminGetAllReports,
  resolveReport as adminResolveReport,
  getSystemOverview as adminGetSystemOverview,
} from './admin';

// Import session helpers to validate the caller's identity for server actions.  Using cookies() allows
// server actions to read the request cookie and verify the session without requiring the client
// to explicitly provide their userId.  This helps ensure that security-sensitive actions cannot
// be performed on behalf of another user simply by passing a different userId.
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

/**
 * Reads the session token from the request cookies and verifies it.  If the cookie is
 * missing or invalid, null is returned.  This helper is intentionally tolerant to
 * exceptions because server actions must never throw due to malformed cookies.
 */
const getSessionFromCookies = async () => {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(cookie, {
      userAgent: headerStore.get('user-agent'),
      ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
    });
  } catch {
    return null;
  }
};

type RegisterUserInput = {
  username: string;
  password: string;
  confirmPassword: string;
  identityKeyPublic: string;
  signedPreKey: string;
  signedPreKeySig: string;
  signingPublicKey?: string;
  captchaId?: string;
  captchaAnswer?: string;
};

type LoginUserInput = {
  username: string;
  password: string;
  captchaId?: string;
  captchaAnswer?: string;
};

type UpdateAdminCredentialsInput = {
  userId: string;
  newUsername: string;
  newPassword: string;
  confirmPassword: string;
};

type UpdateUserProfileInput = {
  userId: string;
  displayName?: string;
  bio?: string;
  profilePhoto?: string | null;
};

type CommunityType = 'GROUP' | 'CHANNEL';

type AdminSettingsUpdate = {
  isSetupCompleted?: boolean;
  isRegistrationEnabled?: boolean;
  maxRegistrations?: number | null;
  isCaptchaEnabled?: boolean;
  maxAttachmentSize?: number;
  allowedFileFormats?: string;
  reservedUsernames?: string;
  rules?: string | null;
  firebaseConfig?: string | null;
};

const asTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getClientIp = async () => {
  const headersList = await headers();
  return headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const sanitizeAdminSettingsUpdate = (input: unknown): AdminSettingsUpdate | null => {
  if (!isRecord(input)) return null;

  const update: AdminSettingsUpdate = {};

  if (typeof input.isSetupCompleted === 'boolean') update.isSetupCompleted = input.isSetupCompleted;
  if (typeof input.isRegistrationEnabled === 'boolean') update.isRegistrationEnabled = input.isRegistrationEnabled;
  if (typeof input.isCaptchaEnabled === 'boolean') update.isCaptchaEnabled = input.isCaptchaEnabled;
  if (typeof input.maxAttachmentSize === 'number') update.maxAttachmentSize = input.maxAttachmentSize;
  if (typeof input.allowedFileFormats === 'string') update.allowedFileFormats = input.allowedFileFormats;
  if (typeof input.reservedUsernames === 'string') update.reservedUsernames = input.reservedUsernames;
  if (typeof input.rules === 'string' || input.rules === null) update.rules = input.rules;
  if (typeof input.firebaseConfig === 'string' || input.firebaseConfig === null)
    update.firebaseConfig = input.firebaseConfig;

  if ('maxRegistrations' in input) {
    if (input.maxRegistrations === null || typeof input.maxRegistrations === 'number') {
      update.maxRegistrations = input.maxRegistrations as number | null;
    } else {
      return null;
    }
  }

  return update;
};

async function logAuditAction(
  action: string,
  adminId?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  try {
    const ip = await getClientIp();
    await prisma.auditLog.create({
      data: {
        action,
        adminId,
        targetId,
        details: details ? JSON.stringify(details) : null,
        ip,
      }
    });
  } catch (error) {
    logger.error('Failed to log audit action.', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function generateCaptcha() {
  try {
    const text = generateCaptchaText(5);
    const svg = generateCaptchaSvg(text);
    const captchaId = await createCaptchaChallengeResilient(text);

    // Return base64-encoded SVG image
    const svgBase64 = Buffer.from(svg).toString('base64');
    const image = `data:image/svg+xml;base64,${svgBase64}`;

    return { success: true, captchaId, image };
  } catch (error) {
    logger.error('Captcha generation error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to generate captcha' };
  }
}

async function validateCaptcha(captchaId: string, answer: string) {
  if (!captchaId || !answer) return false;
  return verifyCaptchaChallengeResilient(captchaId, answer);
}

/**
 * Registers a new user after validating credentials, encryption keys, and captcha.
 */
export async function registerUser(formData: RegisterUserInput) {
  const username = asTrimmedString(formData.username);
  const password = asTrimmedString(formData.password);
  const confirmPassword = asTrimmedString(formData.confirmPassword);
  const identityKeyPublic = asTrimmedString(formData.identityKeyPublic);
  const signedPreKey = asTrimmedString(formData.signedPreKey);
  const signedPreKeySig = asTrimmedString(formData.signedPreKeySig);
  const signingPublicKey = asTrimmedString(formData.signingPublicKey);
  const captchaId = asTrimmedString(formData.captchaId);
  const captchaAnswer = asTrimmedString(formData.captchaAnswer);

  if (!username || !password || !confirmPassword || !identityKeyPublic || !signedPreKey || !signedPreKeySig) {
    return { error: 'Missing required registration fields.' };
  }

  const ip = await getClientIp();
  const rateResult = await rateLimit(`register:${ip}:${username}`);
  if (!rateResult.allowed) {
    return { error: 'Too many registration attempts. Please try again later.' };
  }

  // Get settings
  const settings = await getOrSetCache('adminSettings', async () => {
    return getOrCreateAdminSettings();
  });

  if (!settings.isRegistrationEnabled) {
    return { error: 'Registration is currently disabled by administrator.' };
  }

  if (settings.maxRegistrations !== null) {
    const totalUsers = await prisma.user.count();
    if (totalUsers >= settings.maxRegistrations) {
      return { error: 'Registration limit reached. No more users can register.' };
    }
  }

  // Validate Captcha
  if (settings.isCaptchaEnabled) {
    const isCaptchaValid = await validateCaptcha(captchaId, captchaAnswer);
    if (!isCaptchaValid) {
      return { error: 'Invalid or expired captcha. Please try again.' };
    }
  }

  // Function to generate a random 10-digit numeric ID
  const generateNumericId = () => {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  };

  // 1. Username Validation (Standard Rules)
  // - 3 to 20 characters
  // - Alphanumeric and underscores only
  // - Must start with a letter
  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
  if (!usernameRegex.test(username) || username.toLowerCase() === 'admin') {
    return { error: 'Invalid username or username is reserved.' };
  }

  // 2. Password Validation (Strong Password)
  // - At least 8 characters
  // - At least one uppercase letter
  // - At least one lowercase letter
  // - At least one number
  // - At least one special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return { error: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and a special character.' };
  }

  // 3. Password Confirmation
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return { error: 'Username already taken' };
    }

    const passwordHash = await argon2.hash(password);

    // Generate a unique numeric ID
    let numericId = generateNumericId();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      const existing = await prisma.user.findUnique({ where: { numericId } });
      if (!existing) {
        isUnique = true;
      } else {
        numericId = generateNumericId();
        attempts++;
      }
    }

    const user = await prisma.user.create({
      data: {
        username,
        numericId,
        passwordHash,
        identityKeyPublic,
        signedPreKey,
        signedPreKeySig,
        signingPublicKey: signingPublicKey || null,
        e2eeVersion: signingPublicKey ? 'v2' : 'legacy',
      },
    });

    await logAuditAction('USER_REGISTERED', undefined, user.id, { username });

    return { success: true, userId: user.id };
  } catch (error) {
    logger.error('Registration error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Internal server error' };
  }
}

/**
 * Authenticates a user with rate limiting and lockout protections.
 */
export async function loginUser(formData: LoginUserInput) {
  const username = asTrimmedString(formData.username);
  const password = asTrimmedString(formData.password);
  const captchaId = asTrimmedString(formData.captchaId);
  const captchaAnswer = asTrimmedString(formData.captchaAnswer);

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }
  const ip = await getClientIp();
  const rateResult = await rateLimit(`login:${ip}:${username}`);
  if (!rateResult.allowed) {
    return { error: 'Too many login attempts. Please try again later.' };
  }

  // Get settings
  const settings = await getOrSetCache('adminSettings', async () => {
    return getOrCreateAdminSettings();
  });

  // Validate Captcha
  if (settings.isCaptchaEnabled) {
    const isCaptchaValid = await validateCaptcha(captchaId, captchaAnswer);
    if (!isCaptchaValid) {
      return { error: 'Invalid or expired captcha. Please try again.' };
    }
  }

  // 1. IP Rate Limiting Check
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const failedIpAttempts = await countFailedIpAttempts(ip, fiveMinutesAgo);

  if (failedIpAttempts >= 10) {
    return { error: 'Too many failed attempts from this IP. Please try again later.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      await createLoginAttempt(ip, username, false);
      await logAuditAction('LOGIN_FAILED', undefined, undefined, { username, reason: 'User not found' });
      return { error: 'Invalid username or password' };
    }

    // 2. Account Lockout Check
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      return { error: `Account is temporarily locked. Try again in ${remainingMinutes} minutes.` };
    }

    const isValid = await argon2.verify(user.passwordHash, password);

    if (!isValid) {
      logger.warn('Login failed due to invalid password.', { username });
      // Increment failed attempts and potentially lockout
      const newFailedAttempts = user.failedLoginAttempts + 1;
      let lockoutUntil = null;
      if (newFailedAttempts >= 5) {
        lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          lockoutUntil
        }
      });

      await createLoginAttempt(ip, username, false);
      await logAuditAction('LOGIN_FAILED', undefined, user.id, { username, reason: 'Invalid password' });
      return { error: 'Invalid username or password' };
    }

    // Success: Reset failed attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null
      }
    });

    const defaultAdminUsername = process.env.ADMIN_USERNAME ?? 'admin';
    const defaultAdminPassword = process.env.ADMIN_PASSWORD;

    // Force password change if admin still uses initial credentials
    if (user.username === defaultAdminUsername && defaultAdminPassword && !user.needsPasswordChange) {
      const isDefaultPassword = await argon2.verify(user.passwordHash, defaultAdminPassword);
      if (isDefaultPassword) {
        await prisma.user.update({
          where: { id: user.id },
          data: { needsPasswordChange: true }
        });
        user.needsPasswordChange = true;
      }
    }

    await createLoginAttempt(ip, username, true);
    await logAuditAction('LOGIN_SUCCESS', undefined, user.id, { username });

    // Check if 2FA is enabled
    if (user.totpEnabled) {
      return {
        success: true,
        requires2FA: true,
        userId: user.id,
      };
    }

    // In a real app, set session cookie here
    return { 
      success: true, 
      userId: user.id,
      numericId: user.numericId,
      username: user.username,
      role: user.role,
      badge: user.badge,
      isVerified: user.isVerified,
      needsPasswordChange: user.needsPasswordChange,
      identityKeyPublic: user.identityKeyPublic,
      signedPreKey: user.signedPreKey,
      signedPreKeySig: user.signedPreKeySig
    };
  } catch (error) {
    logger.error('Login error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Internal server error' };
  }
}

/**
 * Updates admin credentials after validation.
 */
export async function updateAdminCredentials(formData: UpdateAdminCredentialsInput) {
  // Derive the authenticated admin from the session rather than trusting the caller-provided userId.
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  // Only administrators may update their credentials.  Reject calls from non‑admins immediately.
  const adminId = session.userId;
  if (session.role !== 'ADMIN') {
    return { error: 'Unauthorized' };
  }

  const newUsername = asTrimmedString(formData.newUsername);
  const newPassword = asTrimmedString(formData.newPassword);
  const confirmPassword = asTrimmedString(formData.confirmPassword);

  if (!newUsername || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
  if (!usernameRegex.test(newUsername)) {
    return { error: 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, or underscores.' };
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return { error: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and a special character.' };
  }

  try {
    // Fetch the admin by session.userId to verify existence and role again on the database layer.
    const user = await prisma.user.findUnique({ where: { id: adminId } });
    if (!user || user.role !== 'ADMIN') {
      return { error: 'Unauthorized' };
    }

    const passwordHash = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: adminId },
      data: {
        username: newUsername,
        passwordHash,
        needsPasswordChange: false,
      },
    });

    await logAuditAction('ADMIN_CREDENTIALS_UPDATED', adminId, adminId, { newUsername });

    return { success: true };
  } catch (error) {
    logger.error('Update admin error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Internal server error' };
  }
}

export async function searchUsers(query: string) {
  const sanitizedQuery = asTrimmedString(query);
  if (!sanitizedQuery) {
    return { success: true, users: [] };
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: sanitizedQuery } },
          { numericId: sanitizedQuery }
        ],
        isBanned: false
      },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true
      },
      take: 10
    });
    return { success: true, users };
  } catch (error) {
    logger.error('Search error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to search users' };
  }
}

export async function getAllUsers(adminId: string) {
  // Delegate to the session‑based adminGetAllUsers (adminId ignored).
  return adminGetAllUsers();
}

export async function toggleBanUser(adminId: string, targetUserId: string) {
  // Delegate to the session‑based adminToggleBanUser.  The adminId is ignored.
  return adminToggleBanUser(targetUserId);
}

export async function updateUserBadges(adminId: string, targetUserId: string, badge: string | null, isVerified: boolean) {
  // Delegate to the session‑based adminUpdateUserBadges.  The adminId is ignored.
  return adminUpdateUserBadges(targetUserId, badge, isVerified);
}

export async function getAdminSettings(adminId: string) {
  // Delegate to the session‑based adminGetAdminSettings.  The adminId is ignored.
  return adminGetAdminSettings();
}

export async function updateAdminSettings(adminId: string, settingsData: AdminSettingsUpdate) {
  // Delegate to the session‑based adminUpdateAdminSettings.  The adminId is ignored.
  return adminUpdateAdminSettings(settingsData as any);
}

export async function getAuditLogs(adminId: string, limit = 100) {
  // Delegate to the session‑based adminGetAuditLogs.  The adminId is ignored.
  return adminGetAuditLogs(limit);
}

export async function exportSystemData(adminId: string) {
  // Delegate to the session‑based adminExportSystemData.  The adminId is ignored.
  return adminExportSystemData();
}

export async function getAllReports(adminId: string) {
  // Delegate to the session‑based adminGetAllReports.  The adminId is ignored.
  return adminGetAllReports();
}

export async function resolveReport(adminId: string, reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  // Delegate to the session‑based adminResolveReport.  The adminId is ignored.
  return adminResolveReport(reportId, status);
}

export async function getSystemOverview(adminId: string) {
  // Delegate to the session‑based adminGetSystemOverview.  The adminId is ignored.
  return adminGetSystemOverview();
}

export async function getPublicSettings() {
  try {
    const settings = await getOrSetCache('publicSettings', async () => {
      const storedSettings = await getOrCreateAdminSettings();
      return {
        isRegistrationEnabled: storedSettings.isRegistrationEnabled,
        isCaptchaEnabled: storedSettings.isCaptchaEnabled,
      };
    });

    return {
      success: true,
      settings,
    };
  } catch (error) {
    logger.error('Get public settings error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to fetch settings' };
  }
}

export async function getUserProfile(userId: string) {
  const sanitizedUserId = asTrimmedString(userId);
  if (!sanitizedUserId) {
    return { error: 'User id is required.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: sanitizedUserId },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true,
        totpEnabled: true,
      },
    });

    if (!user) {
      return { error: 'User not found.' };
    }

    return { success: true, user };
  } catch (error) {
    logger.error('Get profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch profile.' };
  }
}

export async function updateUserProfile(formData: UpdateUserProfileInput) {
  // Derive the authenticated user from the session cookie.  Do not trust the caller‑provided userId.
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }
  const userId = session.userId;

  const displayName = asTrimmedString(formData.displayName);
  const bio = asTrimmedString(formData.bio);
  const profilePhoto =
    typeof formData.profilePhoto === 'string' ? formData.profilePhoto.trim() : formData.profilePhoto;

  // Validate profile fields.  Display names and bios have length limits defined by product requirements.
  if (displayName && displayName.length > 50) {
    return { error: 'Display name must be 50 characters or less.' };
  }

  if (bio && bio.length > 160) {
    return { error: 'Bio must be 160 characters or less.' };
  }

  if (typeof profilePhoto === 'string') {
    const base64Payload = profilePhoto.includes(',') ? profilePhoto.split(',')[1] ?? '' : profilePhoto;
    const estimatedBytes = Math.ceil((base64Payload.length * 3) / 4);
    const maxProfilePhotoBytes = 5 * 1024 * 1024;
    if (estimatedBytes > maxProfilePhotoBytes) {
      return { error: 'Profile photo size must be 5MB or less.' };
    }
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existingUser) {
      return { error: 'User not found.' };
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: displayName || null,
        bio: bio || null,
        profilePhoto: profilePhoto ?? null,
      },
      select: {
        id: true,
        username: true,
        numericId: true,
        displayName: true,
        bio: true,
        profilePhoto: true,
        role: true,
        badge: true,
        isVerified: true,
      },
    });

    await logAuditAction('PROFILE_UPDATED', userId, userId, {
      hasDisplayName: Boolean(displayName),
      hasBio: Boolean(bio),
      hasProfilePhoto: Boolean(profilePhoto),
    });

    return { success: true, user: updatedUser };
  } catch (error) {
    logger.error('Update profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update profile.' };
  }
}

export async function getUserCommunities(userId: string) {
  const sanitizedUserId = asTrimmedString(userId);
  if (!sanitizedUserId) return { error: 'User id is required.' };

  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: sanitizedUserId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            avatar: true,
            type: true,
            isPublic: true,
            inviteLink: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    const communities = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      description: m.group.description,
      avatar: m.group.avatar,
      type: m.group.type,
      isPublic: m.group.isPublic,
      inviteLink: m.group.inviteLink,
      memberCount: m.group._count.members,
      myRole: m.role,
    }));

    return { success: true, communities };
  } catch (error) {
    logger.error('Get user communities error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch communities.' };
  }
}

export async function createCommunity(
  ownerId: string,
  name: string,
  type: CommunityType,
  description?: string,
  isPublic?: boolean,
) {
  const sanitizedOwnerId = asTrimmedString(ownerId);
  const sanitizedName = asTrimmedString(name);
  const sanitizedDesc = asTrimmedString(description);

  if (!sanitizedOwnerId || !sanitizedName) {
    return { error: 'Owner id and name are required.' };
  }

  if (sanitizedName.length > 64) {
    return { error: 'Name must be 64 characters or less.' };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: sanitizedOwnerId }, select: { id: true } });
    if (!user) return { error: 'User not found.' };

    // Generate a unique invite link
    const crypto = await import('crypto');
    const inviteLink = crypto.randomBytes(12).toString('base64url');

    const group = await prisma.group.create({
      data: {
        name: sanitizedName,
        description: sanitizedDesc || null,
        type,
        isPublic: isPublic ?? false,
        inviteLink,
        members: {
          create: {
            userId: sanitizedOwnerId,
            role: 'OWNER',
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isPublic: true,
        inviteLink: true,
        _count: { select: { members: true } },
      },
    });

    return {
      success: true,
      community: {
        id: group.id,
        name: group.name,
        description: group.description,
        type: group.type,
        isPublic: group.isPublic,
        inviteLink: group.inviteLink,
        memberCount: group._count.members,
        myRole: 'OWNER',
      },
    };
  } catch (error) {
    logger.error('Create community error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to create community.' };
  }
}

// ── Contact Management ──────────────────────────────────────
export async function addContact(ownerId: string, contactId: string) {
  const sanitizedOwnerId = asTrimmedString(ownerId);
  const sanitizedContactId = asTrimmedString(contactId);

  if (!sanitizedOwnerId || !sanitizedContactId) {
    return { error: 'Both user IDs are required.' };
  }
  if (sanitizedOwnerId === sanitizedContactId) {
    return { error: 'You cannot add yourself as a contact.' };
  }

  try {
    const contactUser = await prisma.user.findUnique({
      where: { id: sanitizedContactId },
      select: { id: true, username: true, displayName: true, profilePhoto: true, numericId: true, badge: true, isVerified: true, role: true },
    });
    if (!contactUser) return { error: 'User not found.' };

    await prisma.contact.upsert({
      where: { ownerId_contactId: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId } },
      create: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId },
      update: {},
    });

    return { success: true, contact: contactUser };
  } catch (error) {
    logger.error('Add contact error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to add contact.' };
  }
}

export async function removeContact(ownerId: string, contactId: string) {
  const sanitizedOwnerId = asTrimmedString(ownerId);
  const sanitizedContactId = asTrimmedString(contactId);

  if (!sanitizedOwnerId || !sanitizedContactId) {
    return { error: 'Both user IDs are required.' };
  }

  try {
    await prisma.contact.deleteMany({
      where: { ownerId: sanitizedOwnerId, contactId: sanitizedContactId },
    });
    return { success: true };
  } catch (error) {
    logger.error('Remove contact error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to remove contact.' };
  }
}

export async function getContacts(ownerId: string) {
  const sanitizedOwnerId = asTrimmedString(ownerId);
  if (!sanitizedOwnerId) return { error: 'User id is required.' };

  try {
    const contacts = await prisma.contact.findMany({
      where: { ownerId: sanitizedOwnerId },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            numericId: true,
            displayName: true,
            bio: true,
            profilePhoto: true,
            role: true,
            badge: true,
            isVerified: true,
            identityKeyPublic: true,
            signedPreKey: true,
            signedPreKeySig: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      contacts: contacts.map((c) => c.contact),
    };
  } catch (error) {
    logger.error('Get contacts error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch contacts.' };
  }
}

// ── Message History ──────────────────────────────────────────
export async function getMessageHistory(
  userId: string,
  recipientId?: string,
  groupId?: string,
  cursor?: string,
  limit: number = 50,
) {
  return getMessageHistoryExtended(asTrimmedString(userId), recipientId, groupId, cursor, limit);
}

export async function syncConversationState(userId: string, recipientId?: string, groupId?: string, since?: string, limit = 200) {
  return syncConversation(asTrimmedString(userId), { recipientId, groupId, since, limit });
}

export async function markConversationDelivered(userId: string, messageIds: string[]) {
  return markMessagesDelivered(asTrimmedString(userId), Array.isArray(messageIds) ? messageIds : []);
}

export async function reactToMessage(userId: string, messageId: string, emoji: string) {
  return toggleReaction(asTrimmedString(userId), asTrimmedString(messageId), asTrimmedString(emoji));
}

export async function editConversationMessage(userId: string, messageId: string, ciphertext: string, nonce: string) {
  return editMessage(asTrimmedString(userId), asTrimmedString(messageId), asTrimmedString(ciphertext), asTrimmedString(nonce));
}

export async function saveConversationDraft(userId: string, recipientId?: string, groupId?: string, ciphertext?: string, nonce?: string, clientDraft?: string) {
  return saveDraft(asTrimmedString(userId), { recipientId: recipientId ? asTrimmedString(recipientId) : undefined, groupId: groupId ? asTrimmedString(groupId) : undefined, ciphertext: ciphertext ? asTrimmedString(ciphertext) : undefined, nonce: nonce ? asTrimmedString(nonce) : undefined, clientDraft: clientDraft ? asTrimmedString(clientDraft) : undefined });
}

export async function listConversationDrafts(userId: string) {
  return listDrafts(asTrimmedString(userId));
}

export async function deleteConversationDraft(userId: string, recipientId?: string, groupId?: string) {
  return deleteDraft(asTrimmedString(userId), recipientId ? asTrimmedString(recipientId) : undefined, groupId ? asTrimmedString(groupId) : undefined);
}

export async function searchConversationMessages(userId: string, query: string, recipientId?: string, groupId?: string, limit = 25) {
  return searchMessages(asTrimmedString(userId), { query: asTrimmedString(query), recipientId: recipientId ? asTrimmedString(recipientId) : undefined, groupId: groupId ? asTrimmedString(groupId) : undefined, limit });
}

// ── Group/Channel Management ─────────────────────────────────
export async function joinGroupByInvite(userId: string, inviteLink: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedLink = asTrimmedString(inviteLink);

  if (!sanitizedUserId || !sanitizedLink) return { error: 'Missing parameters.' };

  try {
    const group = await prisma.group.findUnique({ where: { inviteLink: sanitizedLink } });
    if (!group) return { error: 'Invalid invite link.' };

    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: sanitizedUserId } },
    });
    if (existing) return { error: 'Already a member.' };

    await prisma.groupMember.create({
      data: { groupId: group.id, userId: sanitizedUserId, role: 'MEMBER' },
    });

    return { success: true, groupId: group.id, groupName: group.name, type: group.type };
  } catch (error) {
    logger.error('Join group error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to join group.' };
  }
}

export async function addMemberToGroup(adminId: string, groupId: string, targetUserId: string) {
  const sanitizedAdminId = asTrimmedString(adminId);
  const sanitizedGroupId = asTrimmedString(groupId);
  const sanitizedTargetId = asTrimmedString(targetUserId);

  if (!sanitizedAdminId || !sanitizedGroupId || !sanitizedTargetId) return { error: 'Missing parameters.' };

  try {
    const adminMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedAdminId } },
    });
    if (!adminMember || !['OWNER', 'ADMIN'].includes(adminMember.role)) {
      return { error: 'You do not have permission to add members.' };
    }

    const targetUser = await prisma.user.findUnique({ where: { id: sanitizedTargetId }, select: { id: true } });
    if (!targetUser) return { error: 'User not found.' };

    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedTargetId } },
      create: { groupId: sanitizedGroupId, userId: sanitizedTargetId, role: 'MEMBER' },
      update: {},
    });

    return { success: true };
  } catch (error) {
    logger.error('Add member error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to add member.' };
  }
}

export async function removeMemberFromGroup(adminId: string, groupId: string, targetUserId: string) {
  const sanitizedAdminId = asTrimmedString(adminId);
  const sanitizedGroupId = asTrimmedString(groupId);
  const sanitizedTargetId = asTrimmedString(targetUserId);

  if (!sanitizedAdminId || !sanitizedGroupId || !sanitizedTargetId) return { error: 'Missing parameters.' };

  try {
    const adminMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedAdminId } },
    });
    if (!adminMember || !['OWNER', 'ADMIN'].includes(adminMember.role)) {
      return { error: 'You do not have permission to remove members.' };
    }

    const targetMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedTargetId } },
    });
    if (!targetMember) return { error: 'Member not found.' };
    if (targetMember.role === 'OWNER') return { error: 'Cannot remove the group owner.' };

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedTargetId } },
    });

    return { success: true };
  } catch (error) {
    logger.error('Remove member error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to remove member.' };
  }
}

export async function getGroupMembers(groupId: string) {
  const sanitizedGroupId = asTrimmedString(groupId);
  if (!sanitizedGroupId) return { error: 'Group id is required.' };

  try {
    const members = await prisma.groupMember.findMany({
      where: { groupId: sanitizedGroupId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            numericId: true,
            displayName: true,
            profilePhoto: true,
            badge: true,
            isVerified: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      members: members.map((m) => ({
        ...m.user,
        groupRole: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  } catch (error) {
    logger.error('Get group members error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch members.' };
  }
}

export async function leaveGroup(userId: string, groupId: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedGroupId = asTrimmedString(groupId);

  if (!sanitizedUserId || !sanitizedGroupId) return { error: 'Missing parameters.' };

  try {
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedUserId } },
    });
    if (!member) return { error: 'Not a member.' };
    if (member.role === 'OWNER') return { error: 'Owner cannot leave. Transfer ownership first or delete the group.' };

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedUserId } },
    });

    return { success: true };
  } catch (error) {
    logger.error('Leave group error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to leave group.' };
  }
}

// ── 2FA TOTP ─────────────────────────────────────────────────
export async function setup2FA(userId: string) {
  const sanitizedUserId = asTrimmedString(userId);
  if (!sanitizedUserId) return { error: 'User id is required.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user) return { error: 'User not found.' };

    if (user.totpEnabled) {
      return { error: '2FA is already enabled.' };
    }

    const { TOTP, Secret } = await import('otpauth');
    const secret = new Secret({ size: 20 });

    // Store the secret (not yet enabled — user must verify first)
    await prisma.user.update({
      where: { id: sanitizedUserId },
      data: { totpSecret: secret.base32 },
    });

    const totp = new TOTP({
      issuer: 'KiNGChat',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();

    // Generate QR code
    const QRCode = await import('qrcode');
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    return {
      success: true,
      secret: secret.base32,
      qrCode: qrDataUrl,
      otpauthUri,
    };
  } catch (error) {
    logger.error('Setup 2FA error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to setup 2FA.' };
  }
}

export async function verify2FA(userId: string, token: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken) return { error: 'Missing parameters.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: 'No 2FA secret found.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'KiNGChat',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      return { error: 'Invalid verification code.' };
    }

    // Enable 2FA
    await prisma.user.update({
      where: { id: sanitizedUserId },
      data: { totpEnabled: true },
    });

    return { success: true };
  } catch (error) {
    logger.error('Verify 2FA error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to verify 2FA.' };
  }
}

export async function disable2FA(userId: string, token: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken) return { error: 'Missing parameters.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: 'No 2FA secret found.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'KiNGChat',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      return { error: 'Invalid verification code.' };
    }

    await prisma.user.update({
      where: { id: sanitizedUserId },
      data: { totpEnabled: false, totpSecret: null },
    });

    return { success: true };
  } catch (error) {
    logger.error('Disable 2FA error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to disable 2FA.' };
  }
}

export async function validate2FALogin(userId: string, token: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken) return { error: 'Missing parameters.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: '2FA is not configured.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'KiNGChat',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(user.totpSecret),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      return { error: 'Invalid 2FA code.' };
    }

    return {
      success: true,
      userId: user.id,
      numericId: user.numericId,
      username: user.username,
      role: user.role,
      badge: user.badge,
      isVerified: user.isVerified,
      needsPasswordChange: user.needsPasswordChange,
      identityKeyPublic: user.identityKeyPublic,
      signedPreKey: user.signedPreKey,
      signedPreKeySig: user.signedPreKeySig,
    };
  } catch (error) {
    logger.error('Validate 2FA login error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to validate 2FA.' };
  }
}

// ── Get user E2EE keys (for establishing shared secret) ──────
export async function getUserPublicKeys(targetUserId: string) {
  const sanitizedId = asTrimmedString(targetUserId);
  if (!sanitizedId) return { error: 'User id is required.' };

  try {
    const user = await prisma.user.findUnique({
      where: { id: sanitizedId },
      select: {
        id: true,
        identityKeyPublic: true,
        signedPreKey: true,
        signedPreKeySig: true,
      },
    });

    if (!user) return { error: 'User not found.' };

    return { success: true, keys: user };
  } catch (error) {
    logger.error('Get public keys error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch keys.' };
  }
}
