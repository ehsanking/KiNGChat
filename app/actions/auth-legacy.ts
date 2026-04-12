'use server';

import { prisma } from '@/lib/prisma';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';
import { getOrSetCache } from '@/lib/cache';
import { countFailedIpAttempts, createLoginAttempt } from '@/lib/login-attempts';
import { getMessageHistoryExtended, syncConversation, markMessagesDelivered, toggleReaction, editMessage, saveDraft, listDrafts, deleteDraft, searchMessages } from '@/lib/messaging-service';
import { rateLimit } from '@/lib/rate-limit';
import argon2 from 'argon2';
import { headers, cookies } from 'next/headers';

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
import { verifyRecaptchaToken } from '@/lib/google-recaptcha';
import { verifyLocalCaptchaChallenge } from '@/lib/local-captcha';
import { createRequestId } from '@/lib/observability';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/secret-encryption';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';
import { createPreAuthChallenge, consumePreAuthChallengeStrict } from '@/lib/preauth-challenge';
import { getFreshSessionUser } from '@/lib/session-auth';

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

const AUTH_REQUIRED_ERROR = { error: 'Authentication required.' };

const requireAuthenticatedUser = async () => {
  const session = await getSessionFromCookies();
  if (!session?.userId) return null;
  const user = await getFreshSessionUser(session);
  if (!user || user.role !== session.role) return null;
  return session;
};

const requireAdminUser = async () => {
  const session = await requireAuthenticatedUser();
  if (!session || session.role !== 'ADMIN') return null;
  return session;
};

type RegisterUserInput = {
  username: string;
  password: string;
  confirmPassword: string;
  identityKeyPublic: string;
  signedPreKey: string;
  signedPreKeySig: string;
  signingPublicKey?: string;
  recoveryQuestion?: string;
  recoveryAnswer?: string;
  captchaToken?: string;
  email?: string;
};

type GetRecoveryQuestionInput = {
  username: string;
};

type RecoverPasswordInput = {
  username: string;
  recoveryAnswer: string;
  newPassword: string;
  confirmPassword: string;
};

type LoginUserInput = {
  username: string;
  password: string;
  captchaToken?: string;
  captchaId?: string;
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


type PublicUserProfile = {
  id: string;
  username: string;
  numericId: string;
  displayName: string | null;
  bio: string | null;
  profilePhoto: string | null;
  role: string;
  badge: string | null;
  isVerified: boolean;
};

type PrivateSelfProfile = PublicUserProfile & {
  totpEnabled: boolean;
};

type CommunityType = 'GROUP' | 'CHANNEL';

type AdminSettingsUpdate = {
  isSetupCompleted?: boolean;
  isRegistrationEnabled?: boolean;
  maxRegistrations?: number | null;
  isCaptchaEnabled?: boolean;
  recaptchaSiteKey?: string | null;
  recaptchaSecretKey?: string | null;
  maxAttachmentSize?: number;
  allowedFileFormats?: string;
  reservedUsernames?: string;
  rules?: string | null;
  firebaseConfig?: string | null;
};

const asTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const isPasswordRecoveryEnabled = () => process.env.PASSWORD_RECOVERY_ENABLED === 'true';
const normalizeReservedUsernames = (raw: string) =>
  new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

const getClientIp = async () => {
  const headersList = await headers();
  return headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const internalActionError = (operation: string) => {
  const requestId = createRequestId();
  return {
    error: `Request failed during ${operation}. Retry once, then contact an administrator with requestId ${requestId}.`,
    errorCode: 'INTERNAL_ERROR' as const,
    requestId,
  };
};

const verifyCaptchaForAuthFlow = async (
  settings: Awaited<ReturnType<typeof getOrCreateAdminSettings>>,
  ip: string,
  captchaToken: string,
  captchaId?: string,
) => {
  if (!settings.isCaptchaEnabled) return { ok: true as const };
  const captchaProvider = (process.env.CAPTCHA_PROVIDER ?? 'recaptcha').trim().toLowerCase();

  if (captchaProvider === 'local') {
    if (!captchaId || !captchaToken) return { ok: false as const, error: 'Captcha verification is required.' };
    return verifyLocalCaptchaChallenge(captchaId, captchaToken)
      ? { ok: true as const }
      : { ok: false as const, error: 'Captcha verification failed.' };
  }

  const recaptchaSiteKey = typeof (settings as Record<string, unknown>).recaptchaSiteKey === 'string'
    ? ((settings as Record<string, unknown>).recaptchaSiteKey as string).trim()
    : '';
  const storedRecaptchaSecretKey = typeof (settings as Record<string, unknown>).recaptchaSecretKey === 'string'
    ? ((settings as Record<string, unknown>).recaptchaSecretKey as string).trim()
    : '';
  const recaptchaSecretKey = storedRecaptchaSecretKey
    ? (isEncryptedSecret(storedRecaptchaSecretKey) ? decryptSecret(storedRecaptchaSecretKey) : storedRecaptchaSecretKey)
    : '';
  if (!recaptchaSiteKey || !recaptchaSecretKey) {
    return { ok: false as const, error: 'Captcha is enabled but not configured by administrator.' };
  }
  if (!captchaToken) return { ok: false as const, error: 'Captcha verification is required.' };
  const captchaVerified = await verifyRecaptchaToken({
    token: captchaToken,
    secret: recaptchaSecretKey,
    remoteIp: ip === 'unknown' ? undefined : ip,
  });
  return captchaVerified ? { ok: true as const } : { ok: false as const, error: 'Captcha verification failed.' };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sanitizeAdminSettingsUpdate = (input: unknown): AdminSettingsUpdate | null => {
  if (!isRecord(input)) return null;

  const update: AdminSettingsUpdate = {};

  if (typeof input.isSetupCompleted === 'boolean') update.isSetupCompleted = input.isSetupCompleted;
  if (typeof input.isRegistrationEnabled === 'boolean') update.isRegistrationEnabled = input.isRegistrationEnabled;
  if (typeof input.isCaptchaEnabled === 'boolean') update.isCaptchaEnabled = input.isCaptchaEnabled;
  if (typeof input.recaptchaSiteKey === 'string' || input.recaptchaSiteKey === null)
    update.recaptchaSiteKey = input.recaptchaSiteKey;
  if (typeof input.recaptchaSecretKey === 'string' || input.recaptchaSecretKey === null)
    update.recaptchaSecretKey = input.recaptchaSecretKey;
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

/**
 * Registers a new user after validating credentials and encryption keys.
 */
export async function registerUser(formData: RegisterUserInput) {
  const username = asTrimmedString(formData.username);
  const password = asTrimmedString(formData.password);
  const confirmPassword = asTrimmedString(formData.confirmPassword);
  const identityKeyPublic = asTrimmedString(formData.identityKeyPublic);
  const signedPreKey = asTrimmedString(formData.signedPreKey);
  const signedPreKeySig = asTrimmedString(formData.signedPreKeySig);
  const signingPublicKey = asTrimmedString(formData.signingPublicKey);
  const recoveryQuestion = asTrimmedString(formData.recoveryQuestion);
  const recoveryAnswer = typeof formData.recoveryAnswer === 'string' ? formData.recoveryAnswer : '';
  const captchaToken = asTrimmedString(formData.captchaToken);
  const email = typeof formData.email === 'string' ? formData.email.trim().toLowerCase() : '';

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
  }, { namespace: 'admin-settings' });

  if (!settings.isRegistrationEnabled) {
    return { error: 'Registration is currently disabled by administrator.' };
  }

  const captchaCheck = await verifyCaptchaForAuthFlow(settings, ip, captchaToken, asTrimmedString((formData as Record<string, unknown>).captchaId));
  if (!captchaCheck.ok) {
    return { error: captchaCheck.error };
  }

  if (settings.maxRegistrations !== null) {
    const totalUsers = await prisma.user.count();
    if (totalUsers >= settings.maxRegistrations) {
      return { error: 'Registration limit reached. No more users can register.' };
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
  const reservedUsernames = normalizeReservedUsernames(settings.reservedUsernames ?? 'admin');
  if (!usernameRegex.test(username) || reservedUsernames.has(username.toLowerCase())) {
    return { error: 'Invalid username or username is reserved.' };
  }

  // 2. Password Validation (Strong Password)
  // - At least 8 characters
  // - At least one uppercase letter
  // - At least one lowercase letter
  // - At least one number
  // - At least one special character
  if (!isPasswordPolicyCompliant(password)) {
    return { error: PASSWORD_POLICY_MESSAGE };
  }

  // 3. Password Confirmation
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  if (recoveryQuestion && (recoveryQuestion.length < 5 || recoveryQuestion.length > 200)) {
    return { error: 'Recovery question must be between 5 and 200 characters.' };
  }

  if (recoveryAnswer && (recoveryAnswer.length < 1 || recoveryAnswer.length > 200)) {
    return { error: 'Recovery answer must be between 1 and 200 characters.' };
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const requireEmailVerification = Boolean((settings as Record<string, unknown>).requireEmailVerification);
  if (requireEmailVerification && !email) {
    return { error: 'An email address is required to register.' };
  }
  if (email && !emailRegex.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return { error: 'Username already taken' };
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return { error: 'An account with this email already exists.' };
      }
    }

    const passwordHash = await argon2.hash(password);
    const recoveryAnswerHash = recoveryAnswer ? await argon2.hash(recoveryAnswer) : null;

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
        isApproved: false,
        identityKeyPublic,
        signedPreKey,
        signedPreKeySig,
        signingPublicKey: signingPublicKey || null,
        e2eeVersion: signingPublicKey ? 'v2' : 'legacy',
        recoveryQuestion: recoveryQuestion || null,
        recoveryAnswerHash,
        ...(email ? { email, emailVerified: false } : {}),
      },
    });

    await logAuditAction('USER_REGISTERED', undefined, user.id, { username });

    // If email verification is required, the client will receive requiresEmailVerification: true
    // and should redirect to the verification page.
    const needsEmailVerification = requireEmailVerification && Boolean(email);
    return { success: true, userId: user.id, requiresEmailVerification: needsEmailVerification };
  } catch (error) {
    logger.error('Registration error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('registration');
  }
}

/**
 * Authenticates a user with rate limiting and lockout protections.
 */
export async function loginUser(formData: LoginUserInput) {
  const username = asTrimmedString(formData.username);
  const password = asTrimmedString(formData.password);
  const captchaToken = asTrimmedString(formData.captchaToken);

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }
  const ip = await getClientIp();
  const rateResult = await rateLimit(`login:${ip}:${username}`);
  if (!rateResult.allowed) {
    return { error: 'Too many login attempts. Please try again later.' };
  }

  // 1. IP Rate Limiting Check
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const failedIpAttempts = await countFailedIpAttempts(ip, fiveMinutesAgo);

  if (failedIpAttempts >= 10) {
    return { error: 'Too many failed attempts from this IP. Please try again later.' };
  }

  const settings = await getOrSetCache('adminSettings', async () => {
    return getOrCreateAdminSettings();
  }, { namespace: 'admin-settings' });

  const captchaCheck = await verifyCaptchaForAuthFlow(settings, ip, captchaToken, asTrimmedString((formData as Record<string, unknown>).captchaId));
  if (!captchaCheck.ok) {
    return { error: captchaCheck.error };
  }

  try {
    const executeLogin = async () => {
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

    if (user.isBanned) {
      await createLoginAttempt(ip, username, false);
      await logAuditAction('LOGIN_BLOCKED_BANNED', undefined, user.id, { username });
      return { error: 'Your account is banned.' };
    }

    if (!user.isApproved) {
      await createLoginAttempt(ip, username, false);
      await logAuditAction('LOGIN_BLOCKED_UNAPPROVED', undefined, user.id, { username });
      return { error: 'Your account is pending administrator approval.' };
    }

    // Success: Reset failed attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null
      }
    });

    await createLoginAttempt(ip, username, true);
    await logAuditAction('LOGIN_SUCCESS', undefined, user.id, { username });

    // Check if 2FA is enabled
    if (user.totpEnabled) {
      return {
        success: true,
        requires2FA: true,
        userId: user.id,
        challengeId: createPreAuthChallenge({
          userId: user.id,
          userAgent: (await headers()).get('user-agent'),
          ip,
        }),
      };
    }

    // In a real app, set session cookie here
      return { 
        success: true, 
        userId: user.id,
        numericId: user.numericId,
        username: user.username,
        role: user.role,
        sessionVersion: user.sessionVersion,
        badge: user.badge,
        isVerified: user.isVerified,
        needsPasswordChange: user.needsPasswordChange,
        identityKeyPublic: user.identityKeyPublic,
        signedPreKey: user.signedPreKey,
        signedPreKeySig: user.signedPreKeySig
      };
    };

    return executeLogin();
  } catch (error) {
    logger.error('Login error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('login');
  }
}

export async function getRecoveryQuestion(formData: GetRecoveryQuestionInput) {
  if (!isPasswordRecoveryEnabled()) return { error: 'Password recovery is disabled.' };
  const username = asTrimmedString(formData.username);
  if (!username) return { error: 'Username is required.' };

  const ip = await getClientIp();
  const rateResult = await rateLimit(`recovery-question:${ip}:${username}`, { windowMs: 10 * 60_000, max: 3 });
  if (!rateResult.allowed) {
    return { error: 'Too many attempts. Please try again later.' };
  }

  try {
    const executeGetRecoveryQuestion = async () => {
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          recoveryQuestion: true,
          recoveryAnswerHash: true,
          isBanned: true,
        },
      });

      if (!user || !user.recoveryQuestion || !user.recoveryAnswerHash || user.isBanned) {
        return { error: 'Recovery is not available for this account.' };
      }

      return { success: true, recoveryQuestion: 'Security answer required.' };
    };

    return executeGetRecoveryQuestion();
  } catch (error) {
    logger.error('Get recovery question error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('recovery question lookup');
  }
}

export async function recoverPassword(formData: RecoverPasswordInput) {
  if (!isPasswordRecoveryEnabled()) return { error: 'Password recovery is disabled.' };
  const username = asTrimmedString(formData.username);
  const recoveryAnswer = typeof formData.recoveryAnswer === 'string' ? formData.recoveryAnswer : '';
  const newPassword = asTrimmedString(formData.newPassword);
  const confirmPassword = asTrimmedString(formData.confirmPassword);

  if (!username || !recoveryAnswer || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  if (!isPasswordPolicyCompliant(newPassword)) {
    return { error: PASSWORD_POLICY_MESSAGE };
  }

  const ip = await getClientIp();
  const rateResult = await rateLimit(`recover-password:${ip}:${username}`, { windowMs: 15 * 60_000, max: 5 });
  if (!rateResult.allowed) {
    return { error: 'Too many recovery attempts. Please try again later.' };
  }

  try {
    const executeRecoverPassword = async () => {
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          recoveryAnswerHash: true,
          isBanned: true,
        },
      });

      if (!user || !user.recoveryAnswerHash || user.isBanned) {
        await logAuditAction('PASSWORD_RECOVERY_FAILED', undefined, undefined, {
          username,
          reason: 'Invalid recovery setup',
        });
        return { error: 'Recovery verification failed.' };
      }

      const isRecoveryAnswerValid = await argon2.verify(user.recoveryAnswerHash, recoveryAnswer);
      if (!isRecoveryAnswerValid) {
        await logAuditAction('PASSWORD_RECOVERY_FAILED', undefined, user.id, {
          username,
          reason: 'Invalid recovery answer',
        });
        return { error: 'Recovery verification failed.' };
      }

      const passwordHash = await argon2.hash(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockoutUntil: null,
          needsPasswordChange: false,
        },
      });

      await logAuditAction('PASSWORD_RECOVERY_SUCCESS', undefined, user.id, { username });
      return { success: true };
    };

    return executeRecoverPassword();
  } catch (error) {
    logger.error('Recover password error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('password recovery');
  }
}

/**
 * Updates admin credentials after validation.
 */
export async function updateAdminCredentials(formData: UpdateAdminCredentialsInput) {
  // Derive the authenticated admin from the session rather than trusting the caller-provided userId.
  const adminSession = await requireAdminUser();
  if (!adminSession) return { error: 'Unauthorized' };
  const adminId = adminSession.userId;

  const newUsername = asTrimmedString(formData.newUsername);
  const newPassword = asTrimmedString(formData.newPassword);
  const confirmPassword = asTrimmedString(formData.confirmPassword);

  if (!newUsername || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  if (!usernameRegex.test(newUsername)) {
    return { error: 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, or underscores.' };
  }

  if (!isPasswordPolicyCompliant(newPassword)) {
    return { error: PASSWORD_POLICY_MESSAGE };
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
        sessionVersion: { increment: 1 },
        needsPasswordChange: false,
      },
    });

    await logAuditAction('ADMIN_CREDENTIALS_UPDATED', adminId, adminId, { newUsername });

    return { success: true };
  } catch (error) {
    logger.error('Update admin error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('admin credential update');
  }
}

/**
 * Changes the admin's password after verifying the current password.
 * This action is available from the admin panel settings.
 */
export async function changeAdminPassword(formData: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const adminSession = await requireAdminUser();
  if (!adminSession) return { error: 'Unauthorized' };
  const adminId = adminSession.userId;

  const currentPassword = asTrimmedString(formData.currentPassword);
  const newPassword = asTrimmedString(formData.newPassword);
  const confirmPassword = asTrimmedString(formData.confirmPassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'New passwords do not match.' };
  }

  if (!isPasswordPolicyCompliant(newPassword)) {
    return { error: PASSWORD_POLICY_MESSAGE };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: adminId } });
    if (!user || user.role !== 'ADMIN') {
      return { error: 'Unauthorized' };
    }

    const isCurrentValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isCurrentValid) {
      return { error: 'Current password is incorrect.' };
    }

    const passwordHash = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: adminId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        needsPasswordChange: false,
      },
    });

    await logAuditAction('ADMIN_PASSWORD_CHANGED', adminId, adminId, {});

    return { success: true };
  } catch (error) {
    logger.error('Change admin password error.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return internalActionError('admin password change');
  }
}

export async function searchUsers(query: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;

  const sanitizedQuery = asTrimmedString(query);
  if (!sanitizedQuery || sanitizedQuery.length < 3) {
    return { success: true, users: [] };
  }

  const ip = await getClientIp();
  const limit = await rateLimit(`search-users:${auth.userId}:${ip}`, { windowMs: 60_000, max: 20 });
  if (!limit.allowed) {
    return { error: 'Please wait before searching again.' };
  }

  const numericQuery = /^\d{6,12}$/.test(sanitizedQuery) ? sanitizedQuery : null;

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: sanitizedQuery } },
          ...(numericQuery ? [{ numericId: numericQuery }] : []),
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

// Legacy wrappers — the adminId parameter is ignored; session-based auth is used instead.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function getAllUsers(adminId?: string) {
  return adminGetAllUsers();
}

export async function toggleBanUser(adminId: string, targetUserId: string) {
  return adminToggleBanUser(targetUserId);
}

export async function updateUserBadges(adminId: string, targetUserId: string, badge: string | null, isVerified: boolean) {
  return adminUpdateUserBadges(targetUserId, badge, isVerified);
}

export async function getAdminSettings(adminId?: string) {
  return adminGetAdminSettings();
}

export async function updateAdminSettings(adminId: string, settingsData: AdminSettingsUpdate) {
  return adminUpdateAdminSettings(settingsData);
}

export async function getAuditLogs(adminId?: string, limit = 100) {
  return adminGetAuditLogs(limit);
}

export async function exportSystemData(adminId?: string) {
  return adminExportSystemData();
}

export async function getAllReports(adminId?: string) {
  return adminGetAllReports();
}

export async function resolveReport(adminId: string, reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  return adminResolveReport(reportId, status);
}

export async function getSystemOverview(adminId?: string) {
  return adminGetSystemOverview();
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function getPublicSettings() {
  try {
    const settings = await getOrSetCache('publicSettings', async () => {
      const storedSettings = await getOrCreateAdminSettings();
      const recaptchaSiteKey = typeof (storedSettings as Record<string, unknown>).recaptchaSiteKey === 'string'
        ? (storedSettings as Record<string, unknown>).recaptchaSiteKey as string
        : null;
      return {
        isRegistrationEnabled: storedSettings.isRegistrationEnabled,
        isCaptchaEnabled: storedSettings.isCaptchaEnabled && Boolean(recaptchaSiteKey),
        recaptchaSiteKey,
      };
    }, { namespace: 'admin-settings' });

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

export async function getPublicUserProfile(userId: string) {
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
      },
    });

    if (!user) {
      return { error: 'User not found.' };
    }

    return { success: true, user: user as PublicUserProfile };
  } catch (error) {
    logger.error('Get profile error.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch profile.' };
  }
}

export async function getSelfUserProfile() {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: 'Authentication required.' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
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

    return { success: true, user: user as PrivateSelfProfile };
  } catch (error) {
    logger.error('Get self profile error.', {
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

export async function getUserCommunities(_userId: string) {
  void _userId;
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;

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
            e2eeEnabled: true,
            isPublic: true,
            inviteLink: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    const communities = memberships.map((m: (typeof memberships)[number]) => ({
      id: m.group.id,
      name: m.group.name,
      description: m.group.description,
      avatar: m.group.avatar,
      type: m.group.type,
      e2eeEnabled: m.group.e2eeEnabled,
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
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedOwnerId = auth.userId;
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
        e2eeEnabled: true,
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
        e2eeEnabled: group.e2eeEnabled,
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
export async function addContact(_ownerId: string, contactId: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedOwnerId = auth.userId;
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
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedOwnerId = auth.userId;
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
  void ownerId;
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedOwnerId = auth.userId;

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
      contacts: contacts.map((c: (typeof contacts)[number]) => c.contact),
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
  _userId: string,
  recipientId?: string,
  groupId?: string,
  cursor?: string,
  limit: number = 50,
) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return getMessageHistoryExtended(auth.userId, recipientId, groupId, cursor, limit);
}

export async function syncConversationState(userId: string, recipientId?: string, groupId?: string, since?: string, limit = 200) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return syncConversation(auth.userId, { recipientId, groupId, since, limit });
}

export async function markConversationDelivered(userId: string, messageIds: string[]) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return markMessagesDelivered(auth.userId, Array.isArray(messageIds) ? messageIds : []);
}

export async function reactToMessage(userId: string, messageId: string, emoji: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return toggleReaction(auth.userId, asTrimmedString(messageId), asTrimmedString(emoji));
}

export async function editConversationMessage(userId: string, messageId: string, ciphertext: string, nonce: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return editMessage(auth.userId, asTrimmedString(messageId), asTrimmedString(ciphertext), asTrimmedString(nonce));
}

export async function saveConversationDraft(userId: string, recipientId?: string, groupId?: string, ciphertext?: string, nonce?: string, clientDraft?: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return saveDraft(auth.userId, { recipientId: recipientId ? asTrimmedString(recipientId) : undefined, groupId: groupId ? asTrimmedString(groupId) : undefined, ciphertext: ciphertext ? asTrimmedString(ciphertext) : undefined, nonce: nonce ? asTrimmedString(nonce) : undefined, clientDraft: clientDraft ? asTrimmedString(clientDraft) : undefined });
}

export async function listConversationDrafts(userId: string) {
  void userId;
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return listDrafts(auth.userId);
}

export async function deleteConversationDraft(userId: string, recipientId?: string, groupId?: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return deleteDraft(auth.userId, recipientId ? asTrimmedString(recipientId) : undefined, groupId ? asTrimmedString(groupId) : undefined);
}

export async function searchConversationMessages(userId: string, query: string, recipientId?: string, groupId?: string, limit = 25) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  return searchMessages(auth.userId, { query: asTrimmedString(query), recipientId: recipientId ? asTrimmedString(recipientId) : undefined, groupId: groupId ? asTrimmedString(groupId) : undefined, limit });
}

// ── Group/Channel Management ─────────────────────────────────
export async function joinGroupByInvite(userId: string, inviteLink: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;
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
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedAdminId = auth.userId;
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
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedAdminId = auth.userId;
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

export async function getGroupMembers(requesterId: string, groupId: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedRequesterId = auth.userId;
  const sanitizedGroupId = asTrimmedString(groupId);
  if (!sanitizedRequesterId || !sanitizedGroupId) return { error: 'Group id is required.' };

  try {
    const [requester, group, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: sanitizedRequesterId }, select: { role: true } }),
      prisma.group.findUnique({ where: { id: sanitizedGroupId }, select: { isPublic: true } }),
      prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: sanitizedGroupId, userId: sanitizedRequesterId } }, select: { id: true } }),
    ]);

    if (!requester || !group) {
      return { error: 'Group not found.' };
    }

    const isAdmin = requester.role === 'ADMIN';
    if (!isAdmin && !membership && !group.isPublic) {
      return { error: 'Unauthorized.' };
    }

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
      members: members.map((m: (typeof members)[number]) => ({
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
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;
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

const readTotpSecretWithMigration = async (userId: string, value: string) => {
  const secret = decryptSecret(value);
  if (!isEncryptedSecret(value)) {
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret) },
    });
  }
  return secret;
};

export async function setup2FA(_userId: string) {
  void _userId;
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;

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
      data: { totpSecret: encryptSecret(secret.base32) },
    });

    const totp = new TOTP({
      issuer: 'Elahe Messenger',
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

export async function verify2FA(_userId: string, token: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken) return { error: 'Missing parameters.' };

  try {
    const ip = await getClientIp();
    const attempt = await rateLimit(`2fa:verify:${sanitizedUserId}:${ip}`, { windowMs: 5 * 60_000, max: 6 });
    if (!attempt.allowed) {
      await logAuditAction('TOTP_VERIFY_LOCKED', sanitizedUserId, sanitizedUserId, { resetAt: attempt.resetAt });
      return { error: 'Verification failed.' };
    }

    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: 'No 2FA secret found.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'Elahe Messenger',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(await readTotpSecretWithMigration(user.id, user.totpSecret)),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      await logAuditAction('TOTP_VERIFY_FAILED', sanitizedUserId, sanitizedUserId, { remaining: attempt.remaining });
      return { error: 'Verification failed.' };
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

export async function disable2FA(_userId: string, token: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth) return AUTH_REQUIRED_ERROR;
  const sanitizedUserId = auth.userId;
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken) return { error: 'Missing parameters.' };

  try {
    const ip = await getClientIp();
    const attempt = await rateLimit(`2fa:disable:${sanitizedUserId}:${ip}`, { windowMs: 5 * 60_000, max: 6 });
    if (!attempt.allowed) {
      await logAuditAction('TOTP_DISABLE_LOCKED', sanitizedUserId, sanitizedUserId, { resetAt: attempt.resetAt });
      return { error: 'Verification failed.' };
    }

    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: 'No 2FA secret found.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'Elahe Messenger',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(await readTotpSecretWithMigration(user.id, user.totpSecret)),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      await logAuditAction('TOTP_DISABLE_FAILED', sanitizedUserId, sanitizedUserId, { remaining: attempt.remaining });
      return { error: 'Verification failed.' };
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

export async function validate2FALogin(userId: string, token: string, challengeId?: string) {
  const sanitizedUserId = asTrimmedString(userId);
  const sanitizedToken = asTrimmedString(token);

  if (!sanitizedUserId || !sanitizedToken || !asTrimmedString(challengeId)) return { error: 'Missing parameters.' };

  try {
    const headerStore = await headers();
    const ip = await getClientIp();
    const challengeValidation = consumePreAuthChallengeStrict({
      challengeId: asTrimmedString(challengeId),
      userId: sanitizedUserId,
      userAgent: headerStore.get('user-agent'),
      ip,
    });
    if (!challengeValidation.ok) {
      if (challengeValidation.reason === 'expired') return { error: '2FA challenge expired. Please log in again.' };
      return { error: '2FA challenge is invalid or already used. Please log in again.' };
    }
    const attempt = await rateLimit(`2fa:login:${sanitizedUserId}:${ip}`, { windowMs: 5 * 60_000, max: 8 });
    if (!attempt.allowed) {
      await logAuditAction('TOTP_LOGIN_LOCKED', undefined, sanitizedUserId, { resetAt: attempt.resetAt });
      return { error: 'Verification failed.' };
    }

    const user = await prisma.user.findUnique({ where: { id: sanitizedUserId } });
    if (!user || !user.totpSecret) return { error: '2FA is not configured.' };
    if (!user.isApproved) return { error: 'Your account is pending administrator approval.' };

    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      issuer: 'Elahe Messenger',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(await readTotpSecretWithMigration(user.id, user.totpSecret)),
    });

    const delta = totp.validate({ token: sanitizedToken, window: 1 });
    if (delta === null) {
      await logAuditAction('TOTP_LOGIN_FAILED', undefined, sanitizedUserId, { remaining: attempt.remaining });
      return { error: 'Verification failed.' };
    }

    return {
      success: true,
      userId: user.id,
      numericId: user.numericId,
      username: user.username,
      role: user.role,
      sessionVersion: user.sessionVersion,
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
