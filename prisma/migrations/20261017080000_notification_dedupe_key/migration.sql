-- The Prisma model already declares notification deduplication, but the
-- migration chain did not create its physical SQLite column or unique index.
ALTER TABLE "notification_inbox" ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "notification_inbox_workspace_id_user_id_dedupe_key_key"
ON "notification_inbox"("workspace_id", "user_id", "dedupe_key");
