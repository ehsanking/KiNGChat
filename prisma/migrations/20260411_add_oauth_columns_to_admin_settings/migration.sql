-- Add missing OAuth provider toggle columns to AdminSettings.
-- These fields exist in the Prisma schema but were never included
-- in a prior migration, causing prisma.adminSettings.findUnique()
-- to fail with "column does not exist" on registration and login.

ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "oauthGoogleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "oauthGithubEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "oauthOidcEnabled"   BOOLEAN NOT NULL DEFAULT false;
