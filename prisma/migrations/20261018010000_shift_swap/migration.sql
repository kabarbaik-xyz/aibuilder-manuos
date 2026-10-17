CREATE TABLE "shift_swap_requests" (
 "id" TEXT NOT NULL PRIMARY KEY, "workspace_id" TEXT NOT NULL,
 "source_roster_id" TEXT NOT NULL REFERENCES roster_intervals(id) ON DELETE RESTRICT,
 "target_roster_id" TEXT NOT NULL REFERENCES roster_intervals(id) ON DELETE RESTRICT,
 "source_technician_id" TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
 "target_technician_id" TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 "reason" TEXT NOT NULL, "snapshot_json" TEXT NOT NULL, "snapshot_hash" TEXT NOT NULL,
 "requested_by_id" TEXT NOT NULL REFERENCES users(id), "decided_by_id" TEXT REFERENCES users(id), "decision_note" TEXT,
 "decided_at" DATETIME, "version" INTEGER NOT NULL DEFAULT 1,
 "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL,
 FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
 CHECK(source_roster_id != target_roster_id), CHECK(source_technician_id != target_technician_id)
);
CREATE UNIQUE INDEX shift_swap_workspace_id_id ON shift_swap_requests(workspace_id,id);
CREATE INDEX shift_swap_workspace_status ON shift_swap_requests(workspace_id,status);
CREATE TRIGGER shift_swap_scope BEFORE INSERT ON shift_swap_requests
WHEN NOT EXISTS(SELECT 1 FROM roster_intervals WHERE id=NEW.source_roster_id AND workspace_id=NEW.workspace_id AND technician_id=NEW.source_technician_id)
 OR NOT EXISTS(SELECT 1 FROM roster_intervals WHERE id=NEW.target_roster_id AND workspace_id=NEW.workspace_id AND technician_id=NEW.target_technician_id)
BEGIN SELECT RAISE(ABORT,'Shift swap scope mismatch'); END;
CREATE TRIGGER shift_swap_pending BEFORE INSERT ON shift_swap_requests
WHEN NEW.status='PENDING' AND EXISTS(SELECT 1 FROM shift_swap_requests WHERE workspace_id=NEW.workspace_id AND status='PENDING' AND (source_roster_id IN (NEW.source_roster_id,NEW.target_roster_id) OR target_roster_id IN (NEW.source_roster_id,NEW.target_roster_id)))
BEGIN SELECT RAISE(ABORT,'A shift already has a pending swap'); END;
