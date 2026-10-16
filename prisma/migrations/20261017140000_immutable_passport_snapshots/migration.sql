ALTER TABLE "passports" ADD COLUMN "snapshot_json" TEXT;
ALTER TABLE "passports" ADD COLUMN "publication_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "passports" ADD COLUMN "published_by_id" TEXT;
ALTER TABLE "passports" ADD COLUMN "shared_customer_id" TEXT;
ALTER TABLE "passports" ADD COLUMN "shared_at" DATETIME;
ALTER TABLE "passports" ADD COLUMN "share_revoked_at" DATETIME;

CREATE TRIGGER "passport_snapshot_immutable"
BEFORE UPDATE ON "passports"
WHEN OLD."snapshot_json" IS NOT NULL AND (
  NEW."snapshot_json" IS NOT OLD."snapshot_json" OR NEW."digest_sha256" IS NOT OLD."digest_sha256" OR
  NEW."publication_version" IS NOT OLD."publication_version" OR NEW."published_at" IS NOT OLD."published_at" OR
  NEW."published_by_id" IS NOT OLD."published_by_id" OR NEW."workspace_id" IS NOT OLD."workspace_id" OR
  NEW."serial_number" IS NOT OLD."serial_number" OR NEW."order_id" IS NOT OLD."order_id" OR
  NEW."item_id" IS NOT OLD."item_id" OR NEW."lot_id" IS NOT OLD."lot_id"
)
BEGIN SELECT RAISE(ABORT, 'Published passport snapshot is immutable'); END;

CREATE TRIGGER "passport_snapshot_no_delete"
BEFORE DELETE ON "passports" WHEN OLD."snapshot_json" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Published passport snapshot cannot be deleted'); END;
