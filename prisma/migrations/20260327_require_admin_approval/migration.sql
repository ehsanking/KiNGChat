ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "User_isApproved_idx" ON "User"("isApproved");

-- Ensure existing administrators remain able to access the system without manual approval.
UPDATE "User"
SET "isApproved" = true
WHERE "role" = 'ADMIN';
