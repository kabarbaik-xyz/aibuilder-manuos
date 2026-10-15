-- Migration: M2 Engineering, Orders and Workflows

-- 1. Workflow Templates
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_type_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workflow_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_templates_workspace_id_order_type_id_fkey" FOREIGN KEY ("workspace_id", "order_type_id") REFERENCES "order_types" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_templates_workspace_id_code_key" ON "workflow_templates"("workspace_id", "code");
CREATE UNIQUE INDEX "workflow_templates_workspace_id_id_key" ON "workflow_templates"("workspace_id", "id");

-- 2. Workflow Versions
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "definition_json" TEXT NOT NULL DEFAULT '{}',
    "definition_hash" TEXT,
    "published_by_id" TEXT,
    "published_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workflow_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_versions_workspace_id_template_id_fkey" FOREIGN KEY ("workspace_id", "template_id") REFERENCES "workflow_templates" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_versions_template_id_version_number_key" ON "workflow_versions"("template_id", "version_number");
CREATE UNIQUE INDEX "workflow_versions_workspace_id_id_key" ON "workflow_versions"("workspace_id", "id");

-- 3. Workflow Nodes
CREATE TABLE "workflow_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OPERATION',
    "department_id" TEXT,
    "required_permission" TEXT,
    "planned_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "requirements_json" TEXT NOT NULL DEFAULT '{}',
    "form_guard_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workflow_nodes_workspace_id_version_id_fkey" FOREIGN KEY ("workspace_id", "version_id") REFERENCES "workflow_versions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_nodes_version_id_key_key" ON "workflow_nodes"("version_id", "key");
CREATE UNIQUE INDEX "workflow_nodes_workspace_id_id_key" ON "workflow_nodes"("workspace_id", "id");

-- 4. Workflow Edges
CREATE TABLE "workflow_edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "from_node_key" TEXT NOT NULL,
    "to_node_key" TEXT NOT NULL,
    "join_policy" TEXT NOT NULL DEFAULT 'AND',
    "condition_code" TEXT,
    "condition_params_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workflow_edges_workspace_id_version_id_fkey" FOREIGN KEY ("workspace_id", "version_id") REFERENCES "workflow_versions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_edges_version_id_from_node_key_to_node_key_key" ON "workflow_edges"("version_id", "from_node_key", "to_node_key");

-- 5. Orders
CREATE TABLE "orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_type_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "ordered_atoms" BIGINT NOT NULL,
    "requested_date" DATETIME NOT NULL,
    "promised_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "orders_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_workspace_id_order_type_id_fkey" FOREIGN KEY ("workspace_id", "order_type_id") REFERENCES "order_types" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "orders_workspace_id_order_number_key" ON "orders"("workspace_id", "order_number");
CREATE UNIQUE INDEX "orders_workspace_id_id_key" ON "orders"("workspace_id", "id");

-- 6. RFQ Drafts
CREATE TABLE "rfq_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT,
    "raw_text" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "extracted_fields_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "rfq_drafts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 7. Customer Questions
CREATE TABLE "customer_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" TEXT,
    "resolved_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "customer_questions_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8. Engineering Revisions
CREATE TABLE "engineering_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "specs_json" TEXT NOT NULL DEFAULT '{}',
    "workflow_version_id" TEXT,
    "output_basis_atoms" BIGINT NOT NULL DEFAULT 1000000,
    "approved_by_id" TEXT,
    "approved_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "engineering_revisions_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "engineering_revisions_order_id_revision_number_key" ON "engineering_revisions"("order_id", "revision_number");
CREATE UNIQUE INDEX "engineering_revisions_workspace_id_id_key" ON "engineering_revisions"("workspace_id", "id");

-- 9. BOM Lines
CREATE TABLE "bom_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "engineering_revision_id" TEXT NOT NULL,
    "operation_node_key" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "input_uom_id" TEXT NOT NULL,
    "requirement_atoms" BIGINT NOT NULL,
    "output_basis_atoms" BIGINT NOT NULL DEFAULT 1000000,
    "allowance_percent" REAL NOT NULL DEFAULT 0.0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bom_lines_workspace_id_engineering_revision_id_fkey" FOREIGN KEY ("workspace_id", "engineering_revision_id") REFERENCES "engineering_revisions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bom_lines_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bom_lines_workspace_id_input_uom_id_fkey" FOREIGN KEY ("workspace_id", "input_uom_id") REFERENCES "uoms" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bom_lines_engineering_revision_id_operation_node_key_item_id_key" ON "bom_lines"("engineering_revision_id", "operation_node_key", "item_id");
CREATE UNIQUE INDEX "bom_lines_workspace_id_id_key" ON "bom_lines"("workspace_id", "id");

-- 10. Workflow Instances
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "engineering_revision_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workflow_instances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_instances_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_instances_workspace_id_workflow_version_id_fkey" FOREIGN KEY ("workspace_id", "workflow_version_id") REFERENCES "workflow_versions" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workflow_instances_workspace_id_engineering_revision_id_fkey" FOREIGN KEY ("workspace_id", "engineering_revision_id") REFERENCES "engineering_revisions" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_instances_workspace_id_id_key" ON "workflow_instances"("workspace_id", "id");

-- 11. Manufacturing Orders
CREATE TABLE "manufacturing_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "mo_number" TEXT NOT NULL,
    "department_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "target_atoms" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "manufacturing_orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "manufacturing_orders_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "manufacturing_orders_workspace_id_department_id_fkey" FOREIGN KEY ("workspace_id", "department_id") REFERENCES "departments" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "manufacturing_orders_workspace_id_mo_number_key" ON "manufacturing_orders"("workspace_id", "mo_number");
CREATE UNIQUE INDEX "manufacturing_orders_workspace_id_id_key" ON "manufacturing_orders"("workspace_id", "id");

-- 12. Jobsheets
CREATE TABLE "jobsheets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "manufacturing_order_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" TEXT,
    "instruction_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "jobsheets_workspace_id_manufacturing_order_id_fkey" FOREIGN KEY ("workspace_id", "manufacturing_order_id") REFERENCES "manufacturing_orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "jobsheets_workspace_id_id_key" ON "jobsheets"("workspace_id", "id");

-- 13. Tasks
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "jobsheet_id" TEXT,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "planned_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "actual_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "target_item_id" TEXT,
    "target_atoms" BIGINT NOT NULL DEFAULT 0,
    "assigned_technician_id" TEXT,
    "assigned_machine_id" TEXT,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_workspace_id_instance_id_fkey" FOREIGN KEY ("workspace_id", "instance_id") REFERENCES "workflow_instances" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tasks_workspace_id_jobsheet_id_fkey" FOREIGN KEY ("workspace_id", "jobsheet_id") REFERENCES "jobsheets" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_workspace_id_assigned_technician_id_fkey" FOREIGN KEY ("workspace_id", "assigned_technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tasks_workspace_id_assigned_machine_id_fkey" FOREIGN KEY ("workspace_id", "assigned_machine_id") REFERENCES "machines" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tasks_instance_id_node_key_attempt_number_key" ON "tasks"("instance_id", "node_key", "attempt_number");
CREATE UNIQUE INDEX "tasks_workspace_id_id_key" ON "tasks"("workspace_id", "id");

-- 14. Task Dependencies
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "predecessor_task_id" TEXT NOT NULL,
    "successor_task_id" TEXT NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'FINISH_TO_START',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_dependencies_workspace_id_predecessor_task_id_fkey" FOREIGN KEY ("workspace_id", "predecessor_task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_dependencies_workspace_id_successor_task_id_fkey" FOREIGN KEY ("workspace_id", "successor_task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "task_dependencies_predecessor_task_id_successor_task_id_key" ON "task_dependencies"("predecessor_task_id", "successor_task_id");

-- 15. Material Demands
CREATE TABLE "material_demands" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "task_id" TEXT,
    "bom_line_id" TEXT,
    "item_id" TEXT NOT NULL,
    "required_atoms" BIGINT NOT NULL,
    "need_by_date" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "material_demands_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_demands_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_demands_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "material_demands_workspace_id_bom_line_id_fkey" FOREIGN KEY ("workspace_id", "bom_line_id") REFERENCES "bom_lines" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "material_demands_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "material_demands_workspace_id_id_key" ON "material_demands"("workspace_id", "id");

-- 16. Workflow Events
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "task_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "command_id" TEXT,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "detail_json" TEXT NOT NULL DEFAULT '{}',
    "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_events_workspace_id_instance_id_fkey" FOREIGN KEY ("workspace_id", "instance_id") REFERENCES "workflow_instances" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workflow_events_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "workflow_events_workspace_id_instance_id_idx" ON "workflow_events"("workspace_id", "instance_id");
CREATE INDEX "workflow_events_workspace_id_occurred_at_idx" ON "workflow_events"("workspace_id", "occurred_at");
