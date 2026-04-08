-- Performance-focused indexes for messaging and admin/audit read paths.
-- Includes PostgreSQL partial indexes for soft-delete filtering.

CREATE INDEX IF NOT EXISTS "Message_senderId_recipientId_createdAt_idx"
  ON "Message"("senderId", "recipientId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_recipientId_senderId_createdAt_idx"
  ON "Message"("recipientId", "senderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_recipientId_createdAt_not_deleted_idx"
  ON "Message"("recipientId", "createdAt" DESC)
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "Message_groupId_createdAt_not_deleted_idx"
  ON "Message"("groupId", "createdAt" DESC)
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
  ON "AuditLog"("action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx"
  ON "User"("role", "createdAt" DESC);
