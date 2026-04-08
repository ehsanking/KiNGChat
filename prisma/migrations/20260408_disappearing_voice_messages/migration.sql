-- Add disappearing and voice-message metadata fields
ALTER TABLE "Message"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "ttlSeconds" INTEGER,
  ADD COLUMN "audioDuration" DOUBLE PRECISION,
  ADD COLUMN "waveformData" TEXT;

ALTER TABLE "Group"
  ADD COLUMN "defaultTtlSeconds" INTEGER;

CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");
