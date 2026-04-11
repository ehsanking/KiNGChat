-- Email verification and SMTP support migration
-- Adds email/emailVerified to User, EmailVerification table, and requireEmailVerification to AdminSettings

-- Add email fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email"         TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Create unique index on email (nullable, so only non-null values are unique)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email") WHERE "email" IS NOT NULL;

-- Add requireEmailVerification to AdminSettings
ALTER TABLE "AdminSettings" ADD COLUMN IF NOT EXISTS "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false;

-- Create EmailVerification table
CREATE TABLE IF NOT EXISTS "EmailVerification" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "email"     TEXT        NOT NULL,
    "code"      TEXT        NOT NULL,
    "purpose"   TEXT        NOT NULL DEFAULT 'EMAIL_VERIFY',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailVerification_userId_purpose_createdAt_idx"
    ON "EmailVerification"("userId", "purpose", "createdAt");

CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx"
    ON "EmailVerification"("expiresAt");
