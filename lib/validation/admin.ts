import { z } from 'zod';

export const adminUserManagementSchema = z.object({
  userId: z.string().trim().min(1),
  action: z.enum(['approve', 'ban', 'unban', 'promote', 'demote']),
});

export const adminSettingsSchema = z.object({
  key: z.string().trim().min(1).max(128),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
