import { z, type ZodIssue, type ZodType } from 'zod';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details: ZodIssue[] };

export function validateBody<T>(schema: ZodType<T>, body: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    error: 'Request validation failed.',
    details: parsed.error.issues,
  };
}

export function toValidationErrorResponse(result: Extract<ValidationResult<unknown>, { success: false }>) {
  return {
    error: result.error,
    errorCode: 'VALIDATION_ERROR' as const,
    details: result.details,
  };
}
