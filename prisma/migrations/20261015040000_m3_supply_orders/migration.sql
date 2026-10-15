-- Migration: M3 Supply Orders & Actual Partial Receipt (O02)

-- 1. Supply Orders Table
CREATE TABLE "supply_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expected_date" DATETIME NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_by_id" TEXT,
    "approved_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "supply_orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_orders_workspace_id_supplier_id_fkey" FOREIGN KEY ("workspace_id", "supplier_id") REFERENCES "suppliers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supply_orders_workspace_id_order_number_key" ON "supply_orders"("workspace_id", "order_number");
CREATE UNIQUE INDEX "supply_orders_workspace_id_id_key" ON "supply_orders"("workspace_id", "id");

-- 2. Supply Order Lines Table
CREATE TABLE "supply_order_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "supply_order_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "ordered_atoms" BIGINT NOT NULL CHECK ("ordered_atoms" > 0),
    "received_atoms" BIGINT NOT NULL DEFAULT 0 CHECK ("received_atoms" >= 0 AND "received_atoms" <= "ordered_atoms"),
    "unit_price_cents" INTEGER,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "supply_order_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_order_lines_workspace_id_supply_order_id_fkey" FOREIGN KEY ("workspace_id", "supply_order_id") REFERENCES "supply_orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_order_lines_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supply_order_lines_workspace_id_id_key" ON "supply_order_lines"("workspace_id", "id");

-- 3. Supply Receipts Table
CREATE TABLE "supply_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "supply_order_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "received_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "received_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_receipts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_receipts_workspace_id_supply_order_id_fkey" FOREIGN KEY ("workspace_id", "supply_order_id") REFERENCES "supply_orders" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supply_receipts_workspace_id_supplier_id_fkey" FOREIGN KEY ("workspace_id", "supplier_id") REFERENCES "suppliers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supply_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supply_receipts_workspace_id_receipt_number_key" ON "supply_receipts"("workspace_id", "receipt_number");
CREATE UNIQUE INDEX "supply_receipts_workspace_id_id_key" ON "supply_receipts"("workspace_id", "id");

-- 4. Supply Receipt Lines Table
CREATE TABLE "supply_receipt_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "supply_order_line_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "received_atoms" BIGINT NOT NULL CHECK ("received_atoms" > 0),
    "movement_id" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_receipt_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_receipt_lines_workspace_id_receipt_id_fkey" FOREIGN KEY ("workspace_id", "receipt_id") REFERENCES "supply_receipts" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "supply_receipt_lines_workspace_id_supply_order_line_id_fkey" FOREIGN KEY ("workspace_id", "supply_order_line_id") REFERENCES "supply_order_lines" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supply_receipt_lines_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supply_receipt_lines_workspace_id_location_id_fkey" FOREIGN KEY ("workspace_id", "location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supply_receipt_lines_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supply_receipt_lines_workspace_id_id_key" ON "supply_receipt_lines"("workspace_id", "id");
