import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(8).max(256),
  captchaToken: z.string().trim().optional(),
  captchaId: z.string().trim().optional(),
  localCaptchaToken: z.string().trim().optional(),
  localCaptchaAnswer: z.string().trim().optional(),
});

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
});

export const twoFactorSchema = z.object({
  token: z.string().trim().min(1).max(12),
});

export const passwordRecoverySchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  username: z.string().trim().min(1).max(128).optional(),
  recoveryQuestion: z.string().trim().min(1).max(500).optional(),
  recoveryAnswer: z.string().trim().min(1).max(500).optional(),
  newPassword: z.string().min(8).max(256).optional(),
});
