'use server';

import { prisma } from '@/lib/prisma';
import { getOrCreateAdminSettings, upsertAdminSettings } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';
import { getOrSetCache, invalidateCache } from '@/lib/cache';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getSessionFromCookieHeader } from '@/lib/session';
import os from 'os';
import fs from 'fs';
import { getOnlineUsersCount } from '@/lib/presence';

const allowedRoles = new Set(['USER', 'ADMIN']);

/**
 * Retrieves the current session from the request cookies and verifies that the user
 * is an administrator. Throws an error if no session is present or the role is not ADMIN.
 */
async function requireAdminSession() {
  const cookieHeader = (await cookies()).toString();
  const session = getSessionFromCookieHeader(cookieHeader);
  if (!session || session.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  return session;
}

// NOTE: A `getAdminSettings` implementation appears later in this file.  Do not
// define it here to avoid duplicate declarations.  The later definition
// returns `{ success: true, settings }` and integrates caching and creation of
// the settings row when it is missing.  Keeping this placeholder prevents
// accidental name collisions.

/**
 * Updates upload limits after validating input.
 */
export async function updateFileUploadSettings(maxSize: number, formats: string) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  const sanitizedMaxSize = Number.isFinite(maxSize) && maxSize > 0 ? Math.floor(maxSize) : null;
  const sanitizedFormats = typeof formats === 'string' ? formats.trim() : '';

  if (!sanitizedMaxSize) {
    return { error: 'Invalid max attachment size.' };
  }

  if (!sanitizedFormats) {
    return { error: 'Allowed file formats cannot be empty.' };
  }

  try {
    await upsertAdminSettings({
      maxAttachmentSize: sanitizedMaxSize,
      allowedFileFormats: sanitizedFormats,
    });
    invalidateCache('adminSettings');
    invalidateCache('publicSettings');
    revalidatePath('/admin/settings');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update file upload settings.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to update settings' };
  }
}

/**
 * Stores Firebase config after validating JSON when provided.
 */
export async function updateFirebaseSettings(config: string | null) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  if (config !== null && typeof config !== 'string') {
    return { error: 'Invalid Firebase configuration payload.' };
  }

  if (typeof config === 'string' && config.trim().length > 0) {
    try {
      JSON.parse(config);
    } catch {
      return { error: 'Firebase configuration must be valid JSON.' };
    }
  }

  try {
    await upsertAdminSettings({ firebaseConfig: config });
    invalidateCache('adminSettings');
    invalidateCache('publicSettings');
    revalidatePath('/admin/settings');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update Firebase settings.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to update Firebase settings' };
  }
}

export async function getUsers() {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        badge: true,
        isVerified: true,
        isApproved: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    return { users };
  } catch (error) {
    logger.error('Failed to fetch users.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to fetch users' };
  }
}

export async function updateUserRole(userId: string, role: string) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  if (!allowedRoles.has(role)) {
    return { error: 'Invalid role selection.' };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role }
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update user role.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to update role' };
  }
}

export async function updateUserBadge(userId: string, badge: string | null) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { badge }
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update user badge.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to update badge' };
  }
}

export async function toggleUserVerification(userId: string, isVerified: boolean) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  if (typeof isVerified !== 'boolean') {
    return { error: 'Invalid verification payload.' };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified }
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update verification status.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return { error: 'Failed to update verification status' };
  }
}

export async function toggleUserApproval(userId: string, isApproved: boolean) {
  try {
    const session = await requireAdminSession();
    const adminId = session.userId;

    if (typeof isApproved !== 'boolean') {
      return { error: 'Invalid approval payload.' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, isApproved: true },
    });

    if (!targetUser) {
      return { error: 'User not found.' };
    }

    if (targetUser.role === 'ADMIN' && !isApproved) {
      return { error: 'Admin accounts must remain approved.' };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isApproved },
    });

    await logAdminAudit(isApproved ? 'USER_APPROVED' : 'USER_APPROVAL_REVOKED', adminId, userId, {
      username: targetUser.username,
      previousApproved: targetUser.isApproved,
      nextApproved: isApproved,
    });

    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    logger.error('Failed to update approval status.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update approval status' };
  }
}

/**
 * Internal helper to log administrative actions.  This function writes to the
 * auditLog table using a simplified format.  In contrast to the logAuditAction
 * function defined in auth.ts, this helper does not attempt to record the
 * caller's IP address because server actions executed via admin.ts do not
 * receive a Request object.  The adminId and targetId are stored along with
 * a JSON-encoded details payload if provided.
 */
async function logAdminAudit(
  action: string,
  adminId?: string,
  targetId?: string,
  details?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        adminId,
        targetId,
        details: details ? JSON.stringify(details) : null,
        ip: null,
      },
    });
  } catch (error) {
    logger.error('Failed to log admin audit action.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Returns a list of all users.  The caller must have an admin session.
 * The result includes additional fields (numericId, isBanned, createdAt) needed
 * for the admin dashboard.
 */
export async function getAllUsers() {
  try {
    // requireAdminSession validates the caller is an ADMIN; throws if not.
    await requireAdminSession();
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        numericId: true,
        role: true,
        badge: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, users };
  } catch (error) {
    logger.error('Failed to fetch all users.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch users' };
  }
}

/**
 * Toggles the banned status of a user.  The caller must be an admin.  An admin
 * cannot ban or unban another admin.  The target user id is required.
 */
export async function toggleBanUser(targetUserId: string) {
  try {
    const session = await requireAdminSession();
    const adminId = session.userId;
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return { error: 'User not found' };
    if (targetUser.role === 'ADMIN') return { error: 'Cannot ban an admin' };

    await prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: !targetUser.isBanned },
    });

    await logAdminAudit(
      !targetUser.isBanned ? 'USER_BANNED' : 'USER_UNBANNED',
      adminId,
      targetUserId,
      { username: targetUser.username },
    );
    return { success: true };
  } catch (error) {
    logger.error('Failed to toggle user ban status.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update user status' };
  }
}

/**
 * Updates a user's badge and verification status.  The caller must be an admin.
 */
export async function updateUserBadges(targetUserId: string, badge: string | null, isVerified: boolean) {
  try {
    const session = await requireAdminSession();
    const adminId = session.userId;
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return { error: 'User not found' };

    await prisma.user.update({
      where: { id: targetUserId },
      data: { badge, isVerified },
    });

    await logAdminAudit('USER_BADGES_UPDATED', adminId, targetUserId, {
      username: targetUser.username,
      badge,
      isVerified,
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to update user badges.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update user badges' };
  }
}

/**
 * Fetches the admin settings.  Only admins may call this function.
 */
export async function getAdminSettings() {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const settings = await getOrSetCache('adminSettings', async () => {
      return getOrCreateAdminSettings();
    });
    return { success: true, settings };
  } catch (error) {
    logger.error('Failed to fetch admin settings.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch settings' };
  }
}

/**
 * Updates multiple admin settings at once.  Accepts an object of settings
 * similar to the AdminSettingsUpdate type.  Only admins may call this function.
 */
export async function updateAdminSettings(settingsData: Record<string, unknown>) {
  try {
    const session = await requireAdminSession();
    const adminId = session.userId;

    // Sanitize input.  Only allow specific fields to be updated.
    const update: Record<string, unknown> = {};
    if (typeof settingsData.isSetupCompleted === 'boolean') update.isSetupCompleted = settingsData.isSetupCompleted;
    if (typeof settingsData.isRegistrationEnabled === 'boolean')
      update.isRegistrationEnabled = settingsData.isRegistrationEnabled;
    if (typeof settingsData.isCaptchaEnabled === 'boolean') update.isCaptchaEnabled = settingsData.isCaptchaEnabled;
    if (typeof settingsData.maxAttachmentSize === 'number') update.maxAttachmentSize = settingsData.maxAttachmentSize;
    if (typeof settingsData.allowedFileFormats === 'string') update.allowedFileFormats = settingsData.allowedFileFormats;
    if (typeof settingsData.reservedUsernames === 'string') update.reservedUsernames = settingsData.reservedUsernames;
    if (typeof settingsData.rules === 'string' || settingsData.rules === null) update.rules = settingsData.rules;
    if (typeof settingsData.firebaseConfig === 'string' || settingsData.firebaseConfig === null)
      update.firebaseConfig = settingsData.firebaseConfig;
    if ('maxRegistrations' in settingsData) {
      if (
        settingsData.maxRegistrations === null ||
        typeof settingsData.maxRegistrations === 'number'
      ) {
        update.maxRegistrations = settingsData.maxRegistrations as number | null;
      } else {
        return { error: 'Invalid maxRegistrations value.' };
      }
    }

    if (Object.keys(update).length === 0) {
      return { error: 'Invalid settings payload.' };
    }

    await upsertAdminSettings(update);

    invalidateCache('adminSettings');
    invalidateCache('publicSettings');
    invalidateCache('systemOverview');

    await logAdminAudit('SETTINGS_UPDATED', adminId, undefined, update);

    return { success: true };
  } catch (error) {
    logger.error('Failed to update admin settings.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update settings' };
  }
}

/**
 * Returns audit log entries.  Limit the number of logs returned to avoid
 * large payloads.  Only admins may call this function.
 */
export async function getAuditLogs(limit = 100) {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: { username: true },
        },
      },
    });
    return { success: true, logs };
  } catch (error) {
    logger.error('Failed to fetch audit logs.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch audit logs' };
  }
}

/**
 * Exports system data (users, settings, reports).  Only admins may call
 * this function.  Returns a JSON string containing the data.
 */
export async function exportSystemData() {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const [users, settings, reports] = await Promise.all([
      prisma.user.findMany(),
      getOrCreateAdminSettings(),
      prisma.report.findMany(),
    ]);
    const data = {
      users,
      settings,
      reports,
      exportedAt: new Date().toISOString(),
    };
    return { success: true, data: JSON.stringify(data, null, 2) };
  } catch (error) {
    logger.error('Failed to export system data.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to export data' };
  }
}

/**
 * Retrieves all reports.  Only admins may call this function.
 */
export async function getAllReports() {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { username: true } },
        reportedUser: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, reports };
  } catch (error) {
    logger.error('Failed to fetch reports.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch reports' };
  }
}

/**
 * Updates the status of a report (resolved or dismissed).  Only admins may call.
 */
export async function resolveReport(reportId: string, status: 'RESOLVED' | 'DISMISSED') {
  try {
    const session = await requireAdminSession();
    const adminId = session.userId;

    await prisma.report.update({
      where: { id: reportId },
      data: { status },
    });

    await logAdminAudit('REPORT_RESOLVED', adminId, undefined, { reportId, status });

    return { success: true };
  } catch (error) {
    logger.error('Failed to update report status.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to update report status' };
  }
}

/**
 * Aggregates system statistics (users, system usage) for the admin dashboard.
 * Cached results are returned if available.  Only admins may call.
 */
export async function getSystemOverview() {
  try {
    await requireAdminSession();
  } catch {
    return { error: 'Unauthorized' };
  }
  try {
    const stats = await getOrSetCache(
      'systemOverview',
      async () => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const [totalUsers, newUsersToday, newUsersThisMonth, newUsersThisYear] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
          prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
          prisma.user.count({ where: { createdAt: { gte: startOfYear } } }),
        ]);
        const cpus = os.cpus();
        const cpuUsage =
          cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            return acc + (total - idle) / total;
          }, 0) / cpus.length;

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        let diskTotalBytes = 0;
        let diskFreeBytes = 0;
        try {
          const stats = fs.statfsSync('/');
          diskTotalBytes = stats.blocks * stats.bsize;
          diskFreeBytes = stats.bavail * stats.bsize;
        } catch (error) {
          logger.warn('Could not read filesystem stats for overview.', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        return {
          users: {
            total: totalUsers,
            today: newUsersToday,
            month: newUsersThisMonth,
            year: newUsersThisYear,
            online: getOnlineUsersCount(),
          },
          system: {
            cpuUsage: Math.round(cpuUsage * 100),
            ramTotal: Math.round(totalMem / (1024 * 1024 * 1024)),
            ramUsed: Math.round(usedMem / (1024 * 1024 * 1024)),
            diskTotal: Math.round(diskTotalBytes / (1024 * 1024 * 1024)),
            diskFree: Math.round(diskFreeBytes / (1024 * 1024 * 1024)),
          },
        };
      },
      { ttlMs: 10_000 },
    );
    return {
      success: true,
      stats,
    };
  } catch (error) {
    logger.error('Failed to fetch system overview.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'Failed to fetch system overview' };
  }
}
