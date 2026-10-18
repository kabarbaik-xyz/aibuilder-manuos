ALTER TABLE "workflow_templates"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PRODUCTION_ROUTING';

ALTER TABLE "orders"
ADD COLUMN "lifecycle_workflow_version_id" TEXT;

CREATE TABLE "order_lifecycle_instances" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "workflow_version_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "order_lifecycle_instances_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_lifecycle_instances_workspace_id_order_id_fkey"
    FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_lifecycle_instances_workspace_id_workflow_version_id_fkey"
    FOREIGN KEY ("workspace_id", "workflow_version_id") REFERENCES "workflow_versions" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_lifecycle_instances_workspace_id_id_key"
ON "order_lifecycle_instances" ("workspace_id", "id");
CREATE UNIQUE INDEX "order_lifecycle_instances_workspace_id_order_id_key"
ON "order_lifecycle_instances" ("workspace_id", "order_id");
CREATE INDEX "order_lifecycle_instances_workspace_id_status_created_at_idx"
ON "order_lifecycle_instances" ("workspace_id", "status", "created_at");

CREATE TABLE "order_lifecycle_stages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "stage_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "assignment_json" TEXT NOT NULL,
  "schedule_json" TEXT NOT NULL,
  "form_pins_json" TEXT NOT NULL DEFAULT '[]',
  "predecessor_keys_json" TEXT NOT NULL DEFAULT '[]',
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "assigned_membership_id" TEXT,
  "due_at" DATETIME,
  "started_at" DATETIME,
  "completed_at" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "order_lifecycle_stages_workspace_id_instance_id_fkey"
    FOREIGN KEY ("workspace_id", "instance_id") REFERENCES "order_lifecycle_instances" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_lifecycle_stages_workspace_id_department_id_fkey"
    FOREIGN KEY ("workspace_id", "department_id") REFERENCES "departments" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_lifecycle_stages_workspace_id_assigned_membership_id_fkey"
    FOREIGN KEY ("workspace_id", "assigned_membership_id") REFERENCES "memberships" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_lifecycle_stages_instance_id_stage_key_key"
ON "order_lifecycle_stages" ("instance_id", "stage_key");
CREATE UNIQUE INDEX "order_lifecycle_stages_workspace_id_id_key"
ON "order_lifecycle_stages" ("workspace_id", "id");
CREATE INDEX "order_lifecycle_stages_workspace_id_state_department_id_due_at_idx"
ON "order_lifecycle_stages" ("workspace_id", "state", "department_id", "due_at");
CREATE INDEX "order_lifecycle_stages_workspace_id_assigned_membership_id_state_idx"
ON "order_lifecycle_stages" ("workspace_id", "assigned_membership_id", "state");

CREATE TABLE "order_lifecycle_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "stage_id" TEXT,
  "event_type" TEXT NOT NULL,
  "from_state" TEXT,
  "to_state" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "command_id" TEXT,
  "detail_json" TEXT NOT NULL DEFAULT '{}',
  "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_lifecycle_events_workspace_id_instance_id_fkey"
    FOREIGN KEY ("workspace_id", "instance_id") REFERENCES "order_lifecycle_instances" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_lifecycle_events_workspace_id_stage_id_fkey"
    FOREIGN KEY ("workspace_id", "stage_id") REFERENCES "order_lifecycle_stages" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "order_lifecycle_events_workspace_id_instance_id_occurred_at_idx"
ON "order_lifecycle_events" ("workspace_id", "instance_id", "occurred_at");
CREATE INDEX "order_lifecycle_events_workspace_id_stage_id_occurred_at_idx"
ON "order_lifecycle_events" ("workspace_id", "stage_id", "occurred_at");
