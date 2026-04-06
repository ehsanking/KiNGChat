-- Phase D cryptographic maturity
CREATE TABLE IF NOT EXISTS "UserDevice" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "label" TEXT,
  "identityKeyPublic" TEXT NOT NULL,
  "signingPublicKey" TEXT NOT NULL,
  "signedPreKey" TEXT NOT NULL,
  "signedPreKeySig" TEXT NOT NULL,
  "ratchetPublicKey" TEXT,
  "lastPreKeyRotationAt" TIMESTAMP,
  "lastSeenAt" TIMESTAMP,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OneTimePreKey" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "signature" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "reservedAt" TIMESTAMP,
  "consumedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  -- Legacy schema compatibility: initial migrations created OneTimePreKey without device lifecycle columns.
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "signature" TEXT;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'AVAILABLE';
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE "OneTimePreKey" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'OneTimePreKey'
      AND column_name = 'keyId'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE "OneTimePreKey" ALTER COLUMN "keyId" TYPE TEXT USING "keyId"::TEXT;
  END IF;

  UPDATE "OneTimePreKey"
  SET "deviceId" = COALESCE("deviceId", "id")
  WHERE "deviceId" IS NULL;

  ALTER TABLE "OneTimePreKey" ALTER COLUMN "deviceId" SET NOT NULL;
END $$;

CREATE TABLE IF NOT EXISTS "E2EESession" (
  "id" TEXT PRIMARY KEY,
  "initiatorUserId" TEXT NOT NULL,
  "initiatorDeviceId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientDeviceId" TEXT NOT NULL,
  "bootstrapPreKeyId" TEXT,
  "rootKeyRef" TEXT NOT NULL,
  "sendingChainKeyRef" TEXT,
  "receivingChainKeyRef" TEXT,
  "lastMessageNumber" INTEGER NOT NULL DEFAULT 0,
  "lastRemoteMessageNumber" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "establishedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "E2EEKeyEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "keyRef" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserDevice_userId_deviceId_key" ON "UserDevice" ("userId","deviceId");
CREATE INDEX IF NOT EXISTS "UserDevice_userId_isRevoked_updatedAt_idx" ON "UserDevice" ("userId","isRevoked","updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "OneTimePreKey_deviceId_keyId_key" ON "OneTimePreKey" ("deviceId","keyId");
CREATE INDEX IF NOT EXISTS "OneTimePreKey_userId_status_createdAt_idx" ON "OneTimePreKey" ("userId","status","createdAt");
CREATE INDEX IF NOT EXISTS "OneTimePreKey_deviceId_status_createdAt_idx" ON "OneTimePreKey" ("deviceId","status","createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "E2EESession_initiatorDeviceId_recipientDeviceId_key" ON "E2EESession" ("initiatorDeviceId","recipientDeviceId");
CREATE INDEX IF NOT EXISTS "E2EESession_initiatorUserId_recipientUserId_status_idx" ON "E2EESession" ("initiatorUserId","recipientUserId","status");
CREATE INDEX IF NOT EXISTS "E2EESession_recipientDeviceId_status_updatedAt_idx" ON "E2EESession" ("recipientDeviceId","status","updatedAt");
CREATE INDEX IF NOT EXISTS "E2EEKeyEvent_userId_createdAt_idx" ON "E2EEKeyEvent" ("userId","createdAt");
CREATE INDEX IF NOT EXISTS "E2EEKeyEvent_deviceId_createdAt_idx" ON "E2EEKeyEvent" ("deviceId","createdAt");
