-- Migration: M3 Inventory, Stock Ledger & Lots (O01)

-- 1. Lots Table
CREATE TABLE "lots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "supplier_lot_number" TEXT,
    "expiration_date" DATETIME,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "lots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lots_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lots_workspace_id_item_id_lot_number_key" ON "lots"("workspace_id", "item_id", "lot_number");
CREATE UNIQUE INDEX "lots_workspace_id_id_key" ON "lots"("workspace_id", "id");

-- 2. Serials Table
CREATE TABLE "serials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "serial_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "serials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "serials_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "serials_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "serials_workspace_id_item_id_serial_number_key" ON "serials"("workspace_id", "item_id", "serial_number");
CREATE UNIQUE INDEX "serials_workspace_id_id_key" ON "serials"("workspace_id", "id");

-- 3. Stock Balances (Projections)
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "bucket_key" TEXT NOT NULL,
    "on_hand_atoms" BIGINT NOT NULL DEFAULT 0 CHECK ("on_hand_atoms" >= 0),
    "reserved_atoms" BIGINT NOT NULL DEFAULT 0 CHECK ("reserved_atoms" >= 0),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_balances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_balances_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_balances_workspace_id_location_id_fkey" FOREIGN KEY ("workspace_id", "location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_balances_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stock_balances_workspace_id_bucket_key_key" ON "stock_balances"("workspace_id", "bucket_key");
CREATE UNIQUE INDEX "stock_balances_workspace_id_id_key" ON "stock_balances"("workspace_id", "id");

-- 4. Stock Reservations
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "demand_id" TEXT,
    "order_id" TEXT,
    "task_id" TEXT,
    "itemId" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "reserved_atoms" BIGINT NOT NULL CHECK ("reserved_atoms" > 0),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "stock_reservations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_demand_id_fkey" FOREIGN KEY ("workspace_id", "demand_id") REFERENCES "material_demands" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "itemId") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_location_id_fkey" FOREIGN KEY ("workspace_id", "location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stock_reservations_workspace_id_id_key" ON "stock_reservations"("workspace_id", "id");

-- 5. Stock Movements (Append-Only Ledger)
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "movement_type" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "source_location_id" TEXT,
    "destination_location_id" TEXT,
    "source_lot_id" TEXT,
    "destination_lot_id" TEXT,
    "atoms" BIGINT NOT NULL CHECK ("atoms" > 0),
    "reference_type" TEXT,
    "reference_id" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "command_id" TEXT,
    "notes" TEXT,
    "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_workspace_id_source_location_id_fkey" FOREIGN KEY ("workspace_id", "source_location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_workspace_id_destination_location_id_fkey" FOREIGN KEY ("workspace_id", "destination_location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_workspace_id_source_lot_id_fkey" FOREIGN KEY ("workspace_id", "source_lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_workspace_id_destination_lot_id_fkey" FOREIGN KEY ("workspace_id", "destination_lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "stock_movements_workspace_id_item_id_idx" ON "stock_movements"("workspace_id", "item_id");
CREATE INDEX "stock_movements_workspace_id_occurred_at_idx" ON "stock_movements"("workspace_id", "occurred_at");
CREATE INDEX "stock_movements_workspace_id_reference_type_reference_id_idx" ON "stock_movements"("workspace_id", "reference_type", "reference_id");
CREATE UNIQUE INDEX "stock_movements_workspace_id_id_key" ON "stock_movements"("workspace_id", "id");

-- 6. Append-Only Triggers for Stock Movements
CREATE TRIGGER IF NOT EXISTS prevent_stock_movement_update
BEFORE UPDATE ON "stock_movements"
BEGIN
    SELECT RAISE(FAIL, 'stock_movements is append-only: updates are forbidden');
END;

CREATE TRIGGER IF NOT EXISTS prevent_stock_movement_delete
BEFORE DELETE ON "stock_movements"
BEGIN
    SELECT RAISE(FAIL, 'stock_movements is append-only: deletions are forbidden');
END;
