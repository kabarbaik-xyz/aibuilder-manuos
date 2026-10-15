-- CreateTable
CREATE TABLE "production_outputs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "item_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "serial_id" TEXT,
    "output_atoms" BIGINT NOT NULL,
    "destination_location_id" TEXT NOT NULL,
    "movement_id" TEXT,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "operator_user_id" TEXT NOT NULL,
    "command_id" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_outputs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_outputs_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_outputs_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "production_outputs_workspace_id_lot_id_fkey" FOREIGN KEY ("workspace_id", "lot_id") REFERENCES "lots" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "production_outputs_workspace_id_destination_location_id_fkey" FOREIGN KEY ("workspace_id", "destination_location_id") REFERENCES "locations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_outputs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "production_output_id" TEXT,
    "supply_receipt_id" TEXT,
    "qc_checklist_id" TEXT,
    "checklist_revision" INTEGER NOT NULL DEFAULT 1,
    "inspected_atoms" BIGINT NOT NULL,
    "passed_atoms" BIGINT NOT NULL DEFAULT 0,
    "rework_atoms" BIGINT NOT NULL DEFAULT 0,
    "scrapped_atoms" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "disposition" TEXT,
    "inspector_user_id" TEXT NOT NULL,
    "reinspection_of_id" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inspections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inspections_workspace_id_production_output_id_fkey" FOREIGN KEY ("workspace_id", "production_output_id") REFERENCES "production_outputs" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inspections_workspace_id_qc_checklist_id_fkey" FOREIGN KEY ("workspace_id", "qc_checklist_id") REFERENCES "qc_checklists" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inspections_workspace_id_reinspection_of_id_fkey" FOREIGN KEY ("workspace_id", "reinspection_of_id") REFERENCES "inspections" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inspections_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inspection_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "check_code" TEXT NOT NULL,
    "check_description" TEXT NOT NULL,
    "check_method" TEXT NOT NULL,
    "measured_value" TEXT,
    "is_passed" BOOLEAN NOT NULL,
    "defect_reason" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inspection_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inspection_results_workspace_id_inspection_id_fkey" FOREIGN KEY ("workspace_id", "inspection_id") REFERENCES "inspections" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rework_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "target_atoms" BIGINT NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "authorized_by_id" TEXT NOT NULL,
    "authorized_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rework_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rework_attempts_workspace_id_inspection_id_fkey" FOREIGN KEY ("workspace_id", "inspection_id") REFERENCES "inspections" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rework_attempts_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rework_attempts_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "production_outputs_workspace_id_id_key" ON "production_outputs"("workspace_id", "id");
CREATE INDEX "production_outputs_workspace_id_task_id_idx" ON "production_outputs"("workspace_id", "task_id");
CREATE INDEX "production_outputs_workspace_id_item_id_idx" ON "production_outputs"("workspace_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_workspace_id_id_key" ON "inspections"("workspace_id", "id");
CREATE INDEX "inspections_workspace_id_production_output_id_idx" ON "inspections"("workspace_id", "production_output_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_results_workspace_id_id_key" ON "inspection_results"("workspace_id", "id");
CREATE INDEX "inspection_results_workspace_id_inspection_id_idx" ON "inspection_results"("workspace_id", "inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "rework_attempts_workspace_id_id_key" ON "rework_attempts"("workspace_id", "id");
CREATE INDEX "rework_attempts_workspace_id_task_id_idx" ON "rework_attempts"("workspace_id", "task_id");
