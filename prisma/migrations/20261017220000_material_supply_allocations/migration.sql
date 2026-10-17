-- CreateTable
CREATE TABLE "material_supply_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "demand_id" TEXT NOT NULL,
    "supply_order_line_id" TEXT NOT NULL,
    "allocated_atoms" BIGINT NOT NULL,
    "received_atoms" BIGINT NOT NULL DEFAULT 0,
    "reserved_atoms" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "material_supply_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_allocations_workspace_id_demand_id_fkey" FOREIGN KEY ("workspace_id", "demand_id") REFERENCES "material_demands" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_allocations_workspace_id_supply_order_line_id_fkey" FOREIGN KEY ("workspace_id", "supply_order_line_id") REFERENCES "supply_order_lines" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "material_supply_allocations_workspace_id_demand_id_supply_order_line_id_key" ON "material_supply_allocations"("workspace_id", "demand_id", "supply_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_supply_allocations_workspace_id_id_key" ON "material_supply_allocations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "material_supply_allocations_workspace_id_supply_order_line_id_idx" ON "material_supply_allocations"("workspace_id", "supply_order_line_id");

-- CreateTable
CREATE TABLE "material_supply_receipt_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "receipt_line_id" TEXT NOT NULL,
    "supply_allocation_id" TEXT NOT NULL,
    "demand_id" TEXT NOT NULL,
    "received_atoms" BIGINT NOT NULL,
    "reserved_atoms" BIGINT NOT NULL DEFAULT 0,
    "stock_reservation_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_supply_receipt_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_receipt_allocations_workspace_id_receipt_line_id_fkey" FOREIGN KEY ("workspace_id", "receipt_line_id") REFERENCES "supply_receipt_lines" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_receipt_allocations_workspace_id_supply_allocation_id_fkey" FOREIGN KEY ("workspace_id", "supply_allocation_id") REFERENCES "material_supply_allocations" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_receipt_allocations_workspace_id_demand_id_fkey" FOREIGN KEY ("workspace_id", "demand_id") REFERENCES "material_demands" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_supply_receipt_allocations_stock_reservation_id_fkey" FOREIGN KEY ("stock_reservation_id") REFERENCES "stock_reservations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "material_supply_receipt_allocations_workspace_id_receipt_line_id_demand_id_key" ON "material_supply_receipt_allocations"("workspace_id", "receipt_line_id", "demand_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_supply_receipt_allocations_workspace_id_id_key" ON "material_supply_receipt_allocations"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "material_supply_receipt_allocations_stock_reservation_id_key" ON "material_supply_receipt_allocations"("stock_reservation_id");

-- CreateIndex
CREATE INDEX "material_supply_receipt_allocations_workspace_id_demand_id_idx" ON "material_supply_receipt_allocations"("workspace_id", "demand_id");
