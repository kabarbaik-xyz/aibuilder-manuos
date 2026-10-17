-- Bind incoming-material QC to one immutable receipt line.
ALTER TABLE "inspections" ADD COLUMN "supply_receipt_line_id" TEXT REFERENCES "supply_receipt_lines" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inspections_workspace_id_supply_receipt_line_id_key"
ON "inspections"("workspace_id", "supply_receipt_line_id");
