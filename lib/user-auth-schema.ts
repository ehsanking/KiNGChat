import { Prisma } from '@prisma/client';

/**
 * Runtime schema patching was removed. Database schema changes must be applied
 * via explicit Prisma migrations to keep production startup deterministic.
 */
export const recoverAuthUserSchemaIfNeeded = async (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return false;
};
