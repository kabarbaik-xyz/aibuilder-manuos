-- CreateTable
CREATE TABLE IF NOT EXISTS "facilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "facilities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "membership_facility_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membership_facility_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "membership_facility_grants_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "membership_facility_grants_workspace_id_facility_id_fkey" FOREIGN KEY ("workspace_id", "facility_id") REFERENCES "facilities" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "issue_reasons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "issue_reasons_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notification_inbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "subject_type" TEXT,
    "subject_id" TEXT,
    "metadata_json" TEXT,
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "notification_inbox_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_inbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable additions
ALTER TABLE "memberships" ADD COLUMN "facility_id" TEXT;
ALTER TABLE "technicians" ADD COLUMN "facility_id" TEXT;
ALTER TABLE "machines" ADD COLUMN "facility_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "facility_id" TEXT;
ALTER TABLE "audit_events" ADD COLUMN "reason" TEXT;
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" TEXT;
ALTER TABLE "workflow_events" ADD COLUMN "reason" TEXT;
ALTER TABLE "workflow_events" ADD COLUMN "correlation_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_workspace_id_code_key" ON "facilities"("workspace_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "facilities_workspace_id_id_key" ON "facilities"("workspace_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "membership_facility_grants_membership_id_facility_id_key" ON "membership_facility_grants"("membership_id", "facility_id");
CREATE UNIQUE INDEX IF NOT EXISTS "issue_reasons_workspace_id_category_code_key" ON "issue_reasons"("workspace_id", "category", "code");
CREATE INDEX IF NOT EXISTS "notification_inbox_workspace_id_user_id_status_idx" ON "notification_inbox"("workspace_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "notification_inbox_workspace_id_created_at_idx" ON "notification_inbox"("workspace_id", "created_at");

-- Backfill default facility for existing workspaces
INSERT INTO "facilities" ("id", "workspace_id", "code", "name", "timezone", "status", "is_default", "created_at", "updated_at")
SELECT
  'fac-' || "id",
  "id",
  'FAC-DEFAULT',
  'Default Operating Site',
  "timezone",
  'ACTIVE',
  1,
  "created_at",
  "updated_at"
FROM "workspaces"
WHERE NOT EXISTS (
  SELECT 1 FROM "facilities" WHERE "facilities"."workspace_id" = "workspaces"."id"
);

UPDATE "memberships" SET "facility_id" = (SELECT "id" FROM "facilities" WHERE "facilities"."workspace_id" = "memberships"."workspace_id" AND "facilities"."is_default" = 1) WHERE "facility_id" IS NULL;
UPDATE "technicians" SET "facility_id" = (SELECT "id" FROM "facilities" WHERE "facilities"."workspace_id" = "technicians"."workspace_id" AND "facilities"."is_default" = 1) WHERE "facility_id" IS NULL;
UPDATE "machines" SET "facility_id" = (SELECT "id" FROM "facilities" WHERE "facilities"."workspace_id" = "machines"."workspace_id" AND "facilities"."is_default" = 1) WHERE "facility_id" IS NULL;
UPDATE "orders" SET "facility_id" = (SELECT "id" FROM "facilities" WHERE "facilities"."workspace_id" = "orders"."workspace_id" AND "facilities"."is_default" = 1) WHERE "facility_id" IS NULL;
