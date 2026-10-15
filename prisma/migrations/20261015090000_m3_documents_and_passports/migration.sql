-- AlterTable
ALTER TABLE "orders" ADD COLUMN "customer_acknowledged" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "customer_acknowledged_at" DATETIME;
ALTER TABLE "orders" ADD COLUMN "customer_acknowledged_by" TEXT;

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "parent_type" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "customer_visible" BOOLEAN NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_links_workspace_id_document_id_fkey" FOREIGN KEY ("workspace_id", "document_id") REFERENCES "documents" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "passports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "order_id" TEXT,
    "item_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "digest_sha256" TEXT NOT NULL,
    "published_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "passports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "passports_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "passports_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "passports_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");
CREATE UNIQUE INDEX "documents_workspace_id_id_key" ON "documents"("workspace_id", "id");
CREATE INDEX "documents_workspace_id_storage_key_idx" ON "documents"("workspace_id", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_workspace_id_id_key" ON "document_links"("workspace_id", "id");
CREATE INDEX "document_links_workspace_id_parent_type_parent_id_idx" ON "document_links"("workspace_id", "parent_type", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "passports_workspace_id_serial_number_key" ON "passports"("workspace_id", "serial_number");
CREATE UNIQUE INDEX "passports_workspace_id_id_key" ON "passports"("workspace_id", "id");
CREATE INDEX "passports_workspace_id_order_id_idx" ON "passports"("workspace_id", "order_id");
