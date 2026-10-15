-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
    "allocated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" DATETIME,
    "delivered_at" DATETIME,
    "carrier_name" TEXT,
    "tracking_number" TEXT,
    "destination_address" TEXT,
    "proof_of_delivery" TEXT,
    "received_by" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shipments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shipments_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shipments_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shipment_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "source_location_id" TEXT NOT NULL,
    "allocated_atoms" BIGINT NOT NULL,
    "dispatched_atoms" BIGINT NOT NULL DEFAULT 0,
    "delivered_atoms" BIGINT NOT NULL DEFAULT 0,
    "movement_id" TEXT,
    "reservation_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shipment_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shipment_lines_workspace_id_shipment_id_fkey" FOREIGN KEY ("workspace_id", "shipment_id") REFERENCES "shipments" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shipment_lines_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shipment_lines_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "shipment_lines_workspace_id_source_location_id_fkey" FOREIGN KEY ("workspace_id", "source_location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_workspace_id_shipment_number_key" ON "shipments"("workspace_id", "shipment_number");
CREATE UNIQUE INDEX "shipments_workspace_id_id_key" ON "shipments"("workspace_id", "id");
CREATE INDEX "shipments_workspace_id_order_id_idx" ON "shipments"("workspace_id", "order_id");
CREATE INDEX "shipments_workspace_id_customer_id_idx" ON "shipments"("workspace_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_lines_workspace_id_id_key" ON "shipment_lines"("workspace_id", "id");
CREATE INDEX "shipment_lines_workspace_id_shipment_id_idx" ON "shipment_lines"("workspace_id", "shipment_id");
