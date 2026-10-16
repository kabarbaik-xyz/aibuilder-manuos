-- Shipment quantities belong to a specific customer order line. This is
-- necessary because atoms from different items cannot be added meaningfully.
ALTER TABLE "shipment_lines"
ADD COLUMN "order_line_id" TEXT REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve historical shipment attribution only where the item identifies one
-- unambiguous order line. Ambiguous legacy rows remain NULL and are never
-- silently assigned to one of several identical-item lines.
UPDATE "shipment_lines"
SET "order_line_id" = (
    SELECT MIN(ol."id")
    FROM "shipments" s
    JOIN "order_lines" ol
      ON ol."workspace_id" = s."workspace_id"
     AND ol."order_id" = s."order_id"
     AND ol."item_id" = "shipment_lines"."item_id"
    WHERE s."workspace_id" = "shipment_lines"."workspace_id"
      AND s."id" = "shipment_lines"."shipment_id"
    HAVING COUNT(ol."id") = 1
)
WHERE "order_line_id" IS NULL;

UPDATE "order_lines"
SET "shipped_atoms" = COALESCE((
    SELECT SUM(sl."dispatched_atoms")
    FROM "shipment_lines" sl
    JOIN "shipments" s
      ON s."workspace_id" = sl."workspace_id"
     AND s."id" = sl."shipment_id"
    WHERE sl."workspace_id" = "order_lines"."workspace_id"
      AND sl."order_line_id" = "order_lines"."id"
      AND s."status" IN ('DISPATCHED', 'DELIVERED')
), 0);

CREATE INDEX "shipment_lines_order_line_id_idx"
ON "shipment_lines"("order_line_id");

CREATE TABLE "recovery_proposals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_version" INTEGER NOT NULL,
    "proposal_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recovery_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recovery_proposals_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recovery_proposals_workspace_id_id_key"
ON "recovery_proposals"("workspace_id", "id");
CREATE INDEX "recovery_proposals_workspace_id_order_id_status_idx"
ON "recovery_proposals"("workspace_id", "order_id", "status");
