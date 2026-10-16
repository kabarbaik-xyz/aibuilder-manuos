-- CreateTable
CREATE TABLE "order_change_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "requested_changes_json" TEXT NOT NULL,
    "impact_summary_json" TEXT,
    "submitted_at" DATETIME,
    "approved_at" DATETIME,
    "approved_by_user_id" TEXT,
    "applied_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "order_change_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_change_requests_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "engineering_change_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_revision_id" TEXT NOT NULL,
    "target_revision_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "impacted_jobs_count" INTEGER NOT NULL DEFAULT 0,
    "migration_policy" TEXT NOT NULL DEFAULT 'RUNNING_JOBS_MIGRATE',
    "approved_at" DATETIME,
    "approved_by_user_id" TEXT,
    "applied_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "engineering_change_orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "non_conformance_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "ncr_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MAJOR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "task_id" TEXT,
    "inspection_id" TEXT,
    "root_cause" TEXT,
    "containment_action" TEXT,
    "corrective_action" TEXT,
    "owner_user_id" TEXT,
    "resolved_at" DATETIME,
    "closed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "non_conformance_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "material_substitutes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "original_item_id" TEXT NOT NULL,
    "substitute_item_id" TEXT NOT NULL,
    "conversion_ratio" BIGINT NOT NULL DEFAULT 1000000,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "order_id" TEXT,
    "reason" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approved_by_user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "material_substitutes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_substitutes_workspace_id_original_item_id_fkey" FOREIGN KEY ("workspace_id", "original_item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_substitutes_workspace_id_substitute_item_id_fkey" FOREIGN KEY ("workspace_id", "substitute_item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "published_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "period_start" DATETIME NOT NULL,
    "period_end" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "snapshot_json" TEXT NOT NULL,
    "published_by_user_id" TEXT NOT NULL,
    "published_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "published_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "order_change_requests_workspace_id_id_key" ON "order_change_requests"("workspace_id", "id");
CREATE UNIQUE INDEX "order_change_requests_workspace_id_request_number_key" ON "order_change_requests"("workspace_id", "request_number");
CREATE INDEX "order_change_requests_workspace_id_order_id_idx" ON "order_change_requests"("workspace_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_change_orders_workspace_id_id_key" ON "engineering_change_orders"("workspace_id", "id");
CREATE UNIQUE INDEX "engineering_change_orders_workspace_id_code_key" ON "engineering_change_orders"("workspace_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformance_reports_workspace_id_id_key" ON "non_conformance_reports"("workspace_id", "id");
CREATE UNIQUE INDEX "non_conformance_reports_workspace_id_ncr_number_key" ON "non_conformance_reports"("workspace_id", "ncr_number");
CREATE INDEX "non_conformance_reports_workspace_id_task_id_idx" ON "non_conformance_reports"("workspace_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_substitutes_workspace_id_id_key" ON "material_substitutes"("workspace_id", "id");
CREATE INDEX "material_substitutes_workspace_id_original_item_id_idx" ON "material_substitutes"("workspace_id", "original_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "published_schedules_workspace_id_id_key" ON "published_schedules"("workspace_id", "id");
CREATE UNIQUE INDEX "published_schedules_workspace_id_revision_number_key" ON "published_schedules"("workspace_id", "revision_number");
CREATE INDEX "published_schedules_workspace_id_period_start_period_end_idx" ON "published_schedules"("workspace_id", "period_start", "period_end");
