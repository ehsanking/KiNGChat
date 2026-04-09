-- Performance improvement: Add GIN indexes for metadata search and common query patterns.
-- These indexes significantly reduce query time for message search and conversation loading.

-- Index on fileName for metadata search (case-insensitive via pg_trgm).
-- This replaces the costly sequential scan with `ILIKE`/`contains`.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Message_fileName_trgm_idx"
  ON "Message" USING gin ("fileName" gin_trgm_ops)
  WHERE "fileName" IS NOT NULL AND "isDeleted" = false;

-- Composite index for conversation listing (most recent messages first).
CREATE INDEX IF NOT EXISTS "Message_senderId_recipientId_createdAt_idx"
  ON "Message" ("senderId", "recipientId", "createdAt" DESC)
  WHERE "isDeleted" = false;

-- Index on delivery status transitions for sync queries.
CREATE INDEX IF NOT EXISTS "Message_deliveredAt_idx"
  ON "Message" ("deliveredAt")
  WHERE "deliveredAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Message_editedAt_idx"
  ON "Message" ("editedAt")
  WHERE "editedAt" IS NOT NULL;

-- Index for idempotency key lookups (avoid full table scan on message send).
CREATE INDEX IF NOT EXISTS "Message_idempotencyKey_idx"
  ON "Message" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- Partial index for pending login attempts (rate limiting queries).
CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_recent_idx"
  ON "LoginAttempt" ("ip", "createdAt" DESC)
  WHERE "success" = false;
