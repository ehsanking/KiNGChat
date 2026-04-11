'use server';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendVerificationCodeEmail, sendPasswordResetEmail, isEmailConfigured } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { headers, cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { createRequestId } from '@/lib/observability';
import argon2 from 'argon2';
import { isPasswordPolicyCompliant, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_DIGITS = 6;

function generateCode(): string {
  const min = 10 ** (CODE_DIGITS - 1);
  const max = 10 ** CODE_DIGITS - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(cookie, {
      userAgent: headerStore.get('user-agent'),
      ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
    });
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function internalError(operation: string) {
  const requestId = createRequestId();
  return {
    error: `Request failed during ${operation}. Retry once, then contact an administrator with requestId ${requestId}.`,
  };
}

/**
 * Sends (or re-sends) a 6-digit verification code to the logged-in user's email.
 * Requires the user to already have an email address on their account.
 */
export async function sendEmailVerificationCode(): Promise<{ success?: true; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: 'Authentication required.' };

  if (!isEmailConfigured()) {
    return { error: 'Email service is not configured on this server.' };
  }

  const ip = await getClientIp();
  const rl = await rateLimit(`send-email-verify:${userId}:${ip}`, { windowMs: 60_000, max: 3 });
  if (!rl.allowed) return { error: 'Too many requests. Please wait before trying again.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { error: 'User not found.' };
    if (user.emailVerified) return { error: 'Your email is already verified.' };
    if (!user.email) return { error: 'No email address is associated with your account.' };

    const code = generateCode();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // Invalidate previous unused codes for this user+purpose
    await prisma.emailVerification.updateMany({
      where: { userId, purpose: 'EMAIL_VERIFY', usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.emailVerification.create({
      data: { userId, email: user.email, code: codeHash, purpose: 'EMAIL_VERIFY', expiresAt },
    });

    await sendVerificationCodeEmail(user.email, code);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send verification code.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError('send verification code');
  }
}

/**
 * Verifies the 6-digit code submitted by the user and marks their email as verified.
 */
export async function verifyEmailCode(code: string): Promise<{ success?: true; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: 'Authentication required.' };

  const trimmedCode = (typeof code === 'string' ? code : '').trim();
  if (!/^\d{6}$/.test(trimmedCode)) return { error: 'Enter a valid 6-digit code.' };

  const ip = await getClientIp();
  const rl = await rateLimit(`verify-email-code:${userId}:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) return { error: 'Too many attempts. Please wait before trying again.' };

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { error: 'User not found.' };
    if (user.emailVerified) return { success: true }; // idempotent

    const now = new Date();
    const pendingEntries = await prisma.emailVerification.findMany({
      where: { userId, purpose: 'EMAIL_VERIFY', usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    for (const entry of pendingEntries) {
      const match = await argon2.verify(entry.code, trimmedCode);
      if (match) {
        await prisma.emailVerification.update({
          where: { id: entry.id },
          data: { usedAt: now },
        });
        await prisma.user.update({
          where: { id: userId },
          data: { emailVerified: true },
        });
        return { success: true };
      }
    }

    return { error: 'Invalid or expired verification code.' };
  } catch (error) {
    logger.error('Failed to verify email code.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError('email verification');
  }
}

/**
 * Initiates email-based password recovery.
 * Sends a 6-digit code to the email associated with the given username.
 * Always returns success to avoid username enumeration.
 */
export async function sendPasswordResetCode(usernameOrEmail: string): Promise<{ success: true }> {
  const input = (typeof usernameOrEmail === 'string' ? usernameOrEmail : '').trim().toLowerCase();
  if (!input) return { success: true };

  const ip = await getClientIp();
  await rateLimit(`send-reset-code:${ip}`, { windowMs: 60_000, max: 5 });

  if (!isEmailConfigured()) return { success: true };

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: input },
          { email: { equals: input } },
        ],
      },
    });

    if (!user?.email) return { success: true };

    const code = generateCode();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await prisma.emailVerification.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.emailVerification.create({
      data: { userId: user.id, email: user.email!, code: codeHash, purpose: 'PASSWORD_RESET', expiresAt },
    });

    await sendPasswordResetEmail(user.email, code);
  } catch (error) {
    logger.error('Failed to send password reset code.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { success: true };
}

/**
 * Resets the user's password using the 6-digit email code.
 */
export async function resetPasswordWithEmailCode(params: {
  usernameOrEmail: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success?: true; error?: string }> {
  const usernameOrEmail = (typeof params.usernameOrEmail === 'string' ? params.usernameOrEmail : '').trim().toLowerCase();
  const code = (typeof params.code === 'string' ? params.code : '').trim();
  const newPassword = typeof params.newPassword === 'string' ? params.newPassword.trim() : '';
  const confirmPassword = typeof params.confirmPassword === 'string' ? params.confirmPassword.trim() : '';

  if (!usernameOrEmail || !code || !newPassword || !confirmPassword) {
    return { error: 'All fields are required.' };
  }
  if (!/^\d{6}$/.test(code)) return { error: 'Enter a valid 6-digit code.' };
  if (newPassword !== confirmPassword) return { error: 'Passwords do not match.' };
  if (!isPasswordPolicyCompliant(newPassword)) return { error: PASSWORD_POLICY_MESSAGE };

  const ip = await getClientIp();
  const rl = await rateLimit(`reset-password-email:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) return { error: 'Too many attempts. Please wait before trying again.' };

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: usernameOrEmail }, { email: { equals: usernameOrEmail } }] },
    });
    if (!user) return { error: 'Invalid or expired code.' };

    const now = new Date();
    const pendingEntries = await prisma.emailVerification.findMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    for (const entry of pendingEntries) {
      const match = await argon2.verify(entry.code, code);
      if (match) {
        const passwordHash = await argon2.hash(newPassword);
        await prisma.emailVerification.update({
          where: { id: entry.id },
          data: { usedAt: now },
        });
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
        return { success: true };
      }
    }

    return { error: 'Invalid or expired code.' };
  } catch (error) {
    logger.error('Failed to reset password with email code.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError('email password reset');
  }
}
