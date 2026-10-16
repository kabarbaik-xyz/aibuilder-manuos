-- Recovery proposal resolution lifecycle (SCH-09): actor, option and note recording
ALTER TABLE "recovery_proposals" ADD COLUMN "proposed_by_id" TEXT;
ALTER TABLE "recovery_proposals" ADD COLUMN "resolved_option_id" TEXT;
ALTER TABLE "recovery_proposals" ADD COLUMN "resolved_by_id" TEXT;
ALTER TABLE "recovery_proposals" ADD COLUMN "resolved_at" DATETIME;
ALTER TABLE "recovery_proposals" ADD COLUMN "resolution_note" TEXT;
