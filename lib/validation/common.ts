import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID format.');
export const nonEmptyStringSchema = z.string().trim().min(1, 'Value is required.');
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .optional();
