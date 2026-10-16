-- CreateTable
CREATE TABLE IF NOT EXISTS "order_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "uom_id" TEXT,
    "ordered_atoms" BIGINT NOT NULL,
    "allocated_atoms" BIGINT NOT NULL DEFAULT 0,
    "shipped_atoms" BIGINT NOT NULL DEFAULT 0,
    "unit_price_cents" BIGINT,
    "requested_date" DATETIME,
    "promised_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "order_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_lines_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_lines_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON UPDATE CASCADE,
    CONSTRAINT "order_lines_workspace_id_uom_id_fkey" FOREIGN KEY ("workspace_id", "uom_id") REFERENCES "uoms" ("workspace_id", "id") ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "drawing_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "drawing_number" TEXT NOT NULL,
    "revision_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "released_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by_id" TEXT,
    "superseded_at" DATETIME,
    "superseded_by_id" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "drawing_revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "drawing_revisions_workspace_id_document_id_fkey" FOREIGN KEY ("workspace_id", "document_id") REFERENCES "documents" ("workspace_id", "id") ON UPDATE CASCADE,
    CONSTRAINT "drawing_revisions_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON UPDATE CASCADE
);

-- AlterTable additions
ALTER TABLE "orders" ADD COLUMN "delivery_address" TEXT;
ALTER TABLE "orders" ADD COLUMN "contract_reference" TEXT;
ALTER TABLE "orders" ADD COLUMN "confirmed_at" DATETIME;
ALTER TABLE "orders" ADD COLUMN "confirmed_by_id" TEXT;

ALTER TABLE "manufacturing_orders" ADD COLUMN "order_line_id" TEXT;
ALTER TABLE "manufacturing_orders" ADD COLUMN "workflow_version_id" TEXT;
ALTER TABLE "manufacturing_orders" ADD COLUMN "engineering_revision_id" TEXT;

ALTER TABLE "engineering_revisions" ADD COLUMN "order_line_id" TEXT;
ALTER TABLE "engineering_revisions" ADD COLUMN "drawing_revision_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "order_lines_workspace_id_id_key" ON "order_lines"("workspace_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "order_lines_workspace_id_order_id_line_number_key" ON "order_lines"("workspace_id", "order_id", "line_number");
CREATE UNIQUE INDEX IF NOT EXISTS "drawing_revisions_workspace_id_id_key" ON "drawing_revisions"("workspace_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "drawing_revisions_workspace_id_item_id_drawing_number_revision_code_key" ON "drawing_revisions"("workspace_id", "item_id", "drawing_number", "revision_code");

-- Backfill each existing order into an order_line
INSERT INTO "order_lines" ("id", "workspace_id", "order_id", "line_number", "item_id", "ordered_atoms", "allocated_atoms", "requested_date", "promised_date", "created_at", "updated_at")
SELECT
  'line-' || "id",
  "workspace_id",
  "id",
  1,
  "item_id",
  "ordered_atoms",
  "ordered_atoms",
  "requested_date",
  "promised_date",
  "created_at",
  "updated_at"
FROM "orders"
WHERE NOT EXISTS (
  SELECT 1 FROM "order_lines" WHERE "order_lines"."order_id" = "orders"."id"
);

UPDATE "manufacturing_orders"
SET "order_line_id" = (
  SELECT "id" FROM "order_lines" WHERE "order_lines"."order_id" = "manufacturing_orders"."order_id" LIMIT 1
)
WHERE "order_line_id" IS NULL;

UPDATE "engineering_revisions"
SET "order_line_id" = (
  SELECT "id" FROM "order_lines" WHERE "order_lines"."order_id" = "engineering_revisions"."order_id" LIMIT 1
)
WHERE "order_line_id" IS NULL;
