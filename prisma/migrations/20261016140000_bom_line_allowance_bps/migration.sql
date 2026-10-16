-- AlterTable
ALTER TABLE "bom_lines" ADD COLUMN "allowance_bps" INTEGER NOT NULL DEFAULT 0;

-- Backfill allowance_bps from allowance_percent
UPDATE "bom_lines" SET "allowance_bps" = CAST(ROUND("allowance_percent" * 100) AS INTEGER);
