ALTER TABLE "workspaces" ADD COLUMN "recovery_batch_atoms" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "recovery_subcontract_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_version" INTEGER NOT NULL,
    "order_version" INTEGER NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "planned_atoms" BIGINT NOT NULL,
    "batch_limit_atoms" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" TEXT NOT NULL,
    "approver_membership_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" DATETIME,
    "returned_at" DATETIME,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recovery_subcontract_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recovery_subcontract_plans_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recovery_subcontract_plans_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recovery_subcontract_plans_workspace_id_supplier_id_fkey" FOREIGN KEY ("workspace_id", "supplier_id") REFERENCES "suppliers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recovery_subcontract_plans_approver_membership_id_fkey" FOREIGN KEY ("approver_membership_id") REFERENCES "memberships" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recovery_subcontract_plans_workspace_id_id_key" ON "recovery_subcontract_plans" ("workspace_id", "id");
CREATE INDEX "recovery_subcontract_plans_workspace_id_task_id_status_idx" ON "recovery_subcontract_plans" ("workspace_id", "task_id", "status");
CREATE INDEX "recovery_subcontract_plans_workspace_id_supplier_id_status_idx" ON "recovery_subcontract_plans" ("workspace_id", "supplier_id", "status");
CREATE INDEX "recovery_subcontract_plans_approver_membership_id_status_idx" ON "recovery_subcontract_plans" ("approver_membership_id", "status");

CREATE TABLE "recovery_subcontract_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "batch_number" INTEGER NOT NULL,
    "quantity_atoms" BIGINT NOT NULL,
    "returned_atoms" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "vendor_reference" TEXT,
    "sent_at" DATETIME,
    "returned_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recovery_subcontract_batches_workspace_id_plan_id_fkey" FOREIGN KEY ("workspace_id", "plan_id") REFERENCES "recovery_subcontract_plans" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recovery_subcontract_batches_workspace_id_id_key" ON "recovery_subcontract_batches" ("workspace_id", "id");
CREATE UNIQUE INDEX "recovery_subcontract_batches_workspace_id_plan_id_batch_number_key" ON "recovery_subcontract_batches" ("workspace_id", "plan_id", "batch_number");
