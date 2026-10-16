-- Machine telemetry ingestion (INT-05): event identity, late-clock flag, reconciliation
CREATE TABLE "machine_telemetry_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_json" TEXT NOT NULL DEFAULT '{}',
    "needs_reconciliation" BOOLEAN NOT NULL DEFAULT false,
    "reconciliation_note" TEXT,
    "reconciled_at" DATETIME,
    "reconciled_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "machine_telemetry_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "machine_telemetry_events_machine_id_fkey" FOREIGN KEY ("workspace_id", "machine_id") REFERENCES "machines" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "machine_telemetry_events_reconciled_by_id_fkey" FOREIGN KEY ("reconciled_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "machine_telemetry_events_workspace_id_machine_id_event_key_key" ON "machine_telemetry_events"("workspace_id", "machine_id", "event_key");
CREATE INDEX "machine_telemetry_events_workspace_id_machine_id_occurred_at_idx" ON "machine_telemetry_events"("workspace_id", "machine_id", "occurred_at");
