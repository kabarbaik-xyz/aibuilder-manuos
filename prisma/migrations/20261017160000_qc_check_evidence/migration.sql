ALTER TABLE "qc_checklist_checks"
ADD COLUMN "requires_evidence" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inspection_results"
ADD COLUMN "evidence_document_id" TEXT;

CREATE INDEX "inspection_results_workspace_id_evidence_document_id_idx"
ON "inspection_results"("workspace_id", "evidence_document_id");

CREATE TRIGGER "inspection_results_evidence_document_workspace_insert"
BEFORE INSERT ON "inspection_results"
WHEN NEW."evidence_document_id" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "documents" d
  WHERE d."workspace_id" = NEW."workspace_id" AND d."id" = NEW."evidence_document_id"
)
BEGIN SELECT RAISE(ABORT, 'QC evidence document must belong to the same workspace'); END;

CREATE TRIGGER "inspection_results_evidence_document_workspace_update"
BEFORE UPDATE OF "workspace_id", "evidence_document_id" ON "inspection_results"
WHEN NEW."evidence_document_id" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "documents" d
  WHERE d."workspace_id" = NEW."workspace_id" AND d."id" = NEW."evidence_document_id"
)
BEGIN SELECT RAISE(ABORT, 'QC evidence document must belong to the same workspace'); END;

CREATE TRIGGER "documents_restrict_qc_evidence_delete"
BEFORE DELETE ON "documents"
WHEN EXISTS (
  SELECT 1 FROM "inspection_results" r
  WHERE r."workspace_id" = OLD."workspace_id" AND r."evidence_document_id" = OLD."id"
)
BEGIN SELECT RAISE(ABORT, 'Document is referenced by QC evidence'); END;
