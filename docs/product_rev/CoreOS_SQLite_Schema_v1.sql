-- CoreOS: SQLite prototype reference schema (v1.0; 2026-10-16)
-- This is a portable SQL reference, not a generated Drizzle migration.
-- Use a single migration owner. Set connection PRAGMAs at open time, outside transactions.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;


-- R0 / Platform: Tenant SaaS root.
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','TRIAL','SUSPENDED')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (slug)
);


-- R0 / Platform: Global account identity; auth credentials handled by auth adapter.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (email)
);


-- R0 / Platform: Manufacturing site, timezone and operational policies.
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS ix_facilities_tenant ON facilities(tenant_id);

-- R0 / Platform: User linked to tenant; optionally a specific facility.
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  facility_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,user_id,facility_id)
);

CREATE INDEX IF NOT EXISTS ix_tenant_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_memberships_1 ON tenant_memberships(tenant_id, user_id);

-- R0 / Platform: Tenant-defined role catalog.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'TENANT',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_roles_tenant ON roles(tenant_id);

-- R0 / Platform: Permission catalog per tenant.
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_permissions_tenant ON permissions(tenant_id);

-- R0 / Platform: RBAC permission grants.
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, permission_id) REFERENCES permissions(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,role_id,permission_id)
);

CREATE INDEX IF NOT EXISTS ix_role_permissions_tenant ON role_permissions(tenant_id);

-- R0 / Platform: RBAC roles attached to tenant membership.
CREATE TABLE IF NOT EXISTS member_roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  membership_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,membership_id,role_id)
);

CREATE INDEX IF NOT EXISTS ix_member_roles_tenant ON member_roles(tenant_id);

-- R0 / Platform: Operational staff grouping.
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,facility_id,code)
);

CREATE INDEX IF NOT EXISTS ix_teams_tenant ON teams(tenant_id);

-- R0 / Orders: Business customer account.
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_customers_tenant ON customers(tenant_id);

-- R0 / Orders: Commercial order and promised date.
CREATE TABLE IF NOT EXISTS customer_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','IN_PRODUCTION','PARTIALLY_DELIVERED','FULFILLED','CANCELLED')),
  requested_delivery_at TEXT,
  promised_delivery_at TEXT,
  currency TEXT NOT NULL DEFAULT 'IDR',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,order_no)
);

CREATE INDEX IF NOT EXISTS ix_customer_orders_tenant ON customer_orders(tenant_id);
CREATE INDEX IF NOT EXISTS ix_customer_orders_1 ON customer_orders(tenant_id, customer_id,status);

-- R0 / Orders: Order line product and ordered quantity.
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  sku TEXT,
  description TEXT NOT NULL,
  ordered_qty INTEGER NOT NULL CHECK (ordered_qty > 0),
  uom TEXT NOT NULL DEFAULT 'PCS',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES customer_orders(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,order_id,line_no)
);

CREATE INDEX IF NOT EXISTS ix_order_items_tenant ON order_items(tenant_id);

-- R0 / Orders: Executable job, often subset of order item quantity.
CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  job_no TEXT NOT NULL,
  target_qty INTEGER NOT NULL CHECK (target_qty > 0),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PLANNED','RELEASED','IN_PROGRESS','DONE','CANCELLED')),
  workflow_version_id TEXT,
  engineering_revision_id TEXT,
  planned_start_at TEXT,
  planned_end_at TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workflow_version_id) REFERENCES workflow_versions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, engineering_revision_id) REFERENCES engineering_revisions(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,job_no)
);

CREATE INDEX IF NOT EXISTS ix_production_jobs_tenant ON production_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_production_jobs_1 ON production_jobs(tenant_id, facility_id,state);
CREATE INDEX IF NOT EXISTS ix_production_jobs_2 ON production_jobs(tenant_id, order_item_id);

-- R0 / Orders: Internal and customer-visible milestones.
CREATE TABLE IF NOT EXISTS order_milestones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  job_id TEXT,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING',
  occurred_at TEXT,
  customer_visible INTEGER NOT NULL DEFAULT 0 CHECK (customer_visible IN (0,1)),
  verified_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES customer_orders(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_order_milestones_tenant ON order_milestones(tenant_id);
CREATE INDEX IF NOT EXISTS ix_order_milestones_1 ON order_milestones(tenant_id, order_id,customer_visible);

-- R0 / Workflow: Human-friendly template identity.
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_workflow_templates_tenant ON workflow_templates(tenant_id);

-- R0 / Workflow: Immutable published revision of a template.
CREATE TABLE IF NOT EXISTS workflow_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  template_id TEXT NOT NULL,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  published_at TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, template_id) REFERENCES workflow_templates(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,template_id,version_no)
);

CREATE INDEX IF NOT EXISTS ix_workflow_versions_tenant ON workflow_versions(tenant_id);

-- R0 / Workflow: Node in a workflow version.
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workflow_version_id TEXT NOT NULL,
  node_key TEXT NOT NULL,
  label TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'TASK' CHECK (node_type IN ('TASK','APPROVAL','QC','MILESTONE')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, workflow_version_id) REFERENCES workflow_versions(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,workflow_version_id,node_key)
);

CREATE INDEX IF NOT EXISTS ix_workflow_nodes_tenant ON workflow_nodes(tenant_id);

-- R0 / Workflow: Directed prerequisite between nodes. Cycles rejected in service.
CREATE TABLE IF NOT EXISTS workflow_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workflow_version_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, workflow_version_id) REFERENCES workflow_versions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, from_node_id) REFERENCES workflow_nodes(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, to_node_id) REFERENCES workflow_nodes(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,workflow_version_id,from_node_id,to_node_id),
  CHECK (from_node_id <> to_node_id)
);

CREATE INDEX IF NOT EXISTS ix_workflow_edges_tenant ON workflow_edges(tenant_id);

-- R0 / Workflow: Single pinned workflow version running for one job.
CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  workflow_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workflow_version_id) REFERENCES workflow_versions(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,job_id)
);

CREATE INDEX IF NOT EXISTS ix_workflow_instances_tenant ON workflow_instances(tenant_id);

-- R0 / Workflow: Execution unit instantiated from a workflow node.
CREATE TABLE IF NOT EXISTS operation_instances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  workflow_instance_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  routing_step_id TEXT,
  operation_no TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PLANNED' CHECK (state IN ('PLANNED','READY','ASSIGNED','IN_PROGRESS','QC_PENDING','DONE','BLOCKED','REWORK','CANCELLED')),
  target_qty INTEGER NOT NULL CHECK (target_qty > 0),
  attempt_no INTEGER NOT NULL DEFAULT 1 CHECK (attempt_no > 0),
  rework_of_operation_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, workflow_instance_id) REFERENCES workflow_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, node_id) REFERENCES workflow_nodes(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, routing_step_id) REFERENCES routing_steps(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, rework_of_operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,workflow_instance_id,operation_no,attempt_no)
);

CREATE INDEX IF NOT EXISTS ix_operation_instances_tenant ON operation_instances(tenant_id);
CREATE INDEX IF NOT EXISTS ix_operation_instances_1 ON operation_instances(tenant_id, workflow_instance_id,state);

-- R0 / Workflow: Controlled approval gate (including QC/engineering).
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  approver_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  decision_at TEXT,
  decision_reason TEXT,
  requested_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_approval_requests_tenant ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS ix_approval_requests_1 ON approval_requests(tenant_id, subject_type,subject_id,status);

-- R0 / Engineering: Engineering document family by order item.
CREATE TABLE IF NOT EXISTS engineering_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_item_id TEXT,
  doc_no TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'DRAWING',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,doc_no)
);

CREATE INDEX IF NOT EXISTS ix_engineering_documents_tenant ON engineering_documents(tenant_id);

-- R0 / Engineering: Released/draft immutable revision metadata.
CREATE TABLE IF NOT EXISTS engineering_revisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL,
  revision_code TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','IN_REVIEW','RELEASED','SUPERSEDED')),
  file_id TEXT,
  checksum_sha256 TEXT,
  released_by TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, document_id) REFERENCES engineering_documents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, file_id) REFERENCES files(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,document_id,revision_code)
);

CREATE INDEX IF NOT EXISTS ix_engineering_revisions_tenant ON engineering_revisions(tenant_id);

-- R0 / Engineering: Released process routing for item/job.
CREATE TABLE IF NOT EXISTS routing_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','RELEASED','SUPERSEDED')),
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,order_item_id,version_no)
);

CREATE INDEX IF NOT EXISTS ix_routing_versions_tenant ON routing_versions(tenant_id);

-- R0 / Engineering: Planned operations, time and work center.
CREATE TABLE IF NOT EXISTS routing_steps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  routing_version_id TEXT NOT NULL,
  step_no INTEGER NOT NULL CHECK (step_no > 0),
  name TEXT NOT NULL,
  work_center_id TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  instructions TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, routing_version_id) REFERENCES routing_versions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, work_center_id) REFERENCES work_centers(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,routing_version_id,step_no)
);

CREATE INDEX IF NOT EXISTS ix_routing_steps_tenant ON routing_steps(tenant_id);

-- R0 / Engineering: Hard skill and optional required certification for operation.
CREATE TABLE IF NOT EXISTS operation_skill_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  routing_step_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  min_level INTEGER NOT NULL CHECK (min_level BETWEEN 0 AND 4),
  certification_type_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, routing_step_id) REFERENCES routing_steps(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, skill_id) REFERENCES skills(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, certification_type_id) REFERENCES certification_types(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,routing_step_id,skill_id)
);

CREATE INDEX IF NOT EXISTS ix_operation_skill_requirements_tenant ON operation_skill_requirements(tenant_id);

-- R0 / Engineering: Bill of materials version associated with item.
CREATE TABLE IF NOT EXISTS bills_of_material (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,order_item_id,version_no)
);

CREATE INDEX IF NOT EXISTS ix_bills_of_material_tenant ON bills_of_material(tenant_id);

-- R0 / Engineering: Material per BOM, integer base unit in prototype.
CREATE TABLE IF NOT EXISTS bom_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  bom_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  qty_per_unit INTEGER NOT NULL CHECK (qty_per_unit > 0),
  operation_step_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, bom_id) REFERENCES bills_of_material(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES materials(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, operation_step_id) REFERENCES routing_steps(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,bom_id,material_id,operation_step_id)
);

CREATE INDEX IF NOT EXISTS ix_bom_lines_tenant ON bom_lines(tenant_id);

-- R0 / Materials: Material catalog; inventory ERP remains external.
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  base_uom TEXT NOT NULL DEFAULT 'PCS',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_materials_tenant ON materials(tenant_id);

-- R0 / Materials: Material demand per production job or operation.
CREATE TABLE IF NOT EXISTS material_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  operation_id TEXT,
  material_id TEXT NOT NULL,
  required_qty INTEGER NOT NULL CHECK (required_qty > 0),
  ready_qty INTEGER NOT NULL DEFAULT 0 CHECK (ready_qty >= 0),
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES materials(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_material_requirements_tenant ON material_requirements(tenant_id);
CREATE INDEX IF NOT EXISTS ix_material_requirements_1 ON material_requirements(tenant_id, job_id,status);

-- R0 / Materials: Shortage, delay and production blocker.
CREATE TABLE IF NOT EXISTS material_issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  job_id TEXT,
  operation_id TEXT,
  material_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner_user_id TEXT,
  expected_resolution_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES materials(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_material_issues_tenant ON material_issues(tenant_id);
CREATE INDEX IF NOT EXISTS ix_material_issues_1 ON material_issues(tenant_id, operation_id,status);

-- R0 / People & Resources: Technician profile linked to user optionally.
CREATE TABLE IF NOT EXISTS technicians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  user_id TEXT,
  team_id TEXT,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, team_id) REFERENCES teams(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,employee_code)
);

CREATE INDEX IF NOT EXISTS ix_technicians_tenant ON technicians(tenant_id);
CREATE INDEX IF NOT EXISTS ix_technicians_1 ON technicians(tenant_id, facility_id,status);

-- R0 / People & Resources: Tenant skill catalog.
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_skills_tenant ON skills(tenant_id);

-- R0 / People & Resources: Supervisor-verified skill capability, with validity window.
CREATE TABLE IF NOT EXISTS technician_skills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  technician_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  claimed_level INTEGER CHECK (claimed_level BETWEEN 0 AND 4),
  verified_level INTEGER CHECK (verified_level BETWEEN 0 AND 4),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','REVOKED')),
  verified_by TEXT,
  verified_at TEXT,
  valid_until TEXT,
  evidence_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, skill_id) REFERENCES skills(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, evidence_file_id) REFERENCES files(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,technician_id,skill_id)
);

CREATE INDEX IF NOT EXISTS ix_technician_skills_tenant ON technician_skills(tenant_id);

-- R0 / People & Resources: Required certification / authorization type.
CREATE TABLE IF NOT EXISTS certification_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  mandatory INTEGER NOT NULL DEFAULT 1 CHECK (mandatory IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_certification_types_tenant ON certification_types(tenant_id);

-- R0 / People & Resources: Actual certification/authorization and expiry.
CREATE TABLE IF NOT EXISTS technician_certifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  technician_id TEXT NOT NULL,
  certification_type_id TEXT NOT NULL,
  credential_no TEXT,
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  verified_by TEXT,
  evidence_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, certification_type_id) REFERENCES certification_types(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, evidence_file_id) REFERENCES files(tenant_id, id) ON DELETE RESTRICT,
  CHECK (valid_from < valid_until)
);

CREATE INDEX IF NOT EXISTS ix_technician_certifications_tenant ON technician_certifications(tenant_id);
CREATE INDEX IF NOT EXISTS ix_technician_certifications_1 ON technician_certifications(tenant_id, technician_id,valid_until);

-- R0 / People & Resources: Plant station/work center.
CREATE TABLE IF NOT EXISTS work_centers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,facility_id,code)
);

CREATE INDEX IF NOT EXISTS ix_work_centers_tenant ON work_centers(tenant_id);

-- R0 / People & Resources: Machine and exclusive capacity in MVP.
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  work_center_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (state IN ('AVAILABLE','MAINTENANCE','OFFLINE')),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity = 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, work_center_id) REFERENCES work_centers(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,code)
);

CREATE INDEX IF NOT EXISTS ix_machines_tenant ON machines(tenant_id);

-- R0 / People & Resources: Reusable roster definition with local times.
CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  name TEXT NOT NULL,
  local_start TEXT NOT NULL,
  local_end TEXT NOT NULL,
  crosses_midnight INTEGER NOT NULL DEFAULT 0 CHECK (crosses_midnight IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_shift_templates_tenant ON shift_templates(tenant_id);

-- R0 / People & Resources: Published technician availability intervals in UTC.
CREATE TABLE IF NOT EXISTS roster_slots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  technician_id TEXT NOT NULL,
  shift_template_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PUBLISHED','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, shift_template_id) REFERENCES shift_templates(tenant_id, id) ON DELETE RESTRICT,
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS ix_roster_slots_tenant ON roster_slots(tenant_id);
CREATE INDEX IF NOT EXISTS ix_roster_slots_1 ON roster_slots(tenant_id, technician_id,start_at,end_at);

-- R0 / People & Resources: Non-working intervals within roster slot.
CREATE TABLE IF NOT EXISTS roster_breaks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  roster_slot_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, roster_slot_id) REFERENCES roster_slots(tenant_id, id) ON DELETE RESTRICT,
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS ix_roster_breaks_tenant ON roster_breaks(tenant_id);

-- R0 / People & Resources: Leave, training, holiday and machine outage intervals.
CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  technician_id TEXT,
  machine_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('LEAVE','TRAINING','HOLIDAY','DOWNTIME','OTHER')),
  approval_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_state IN ('PENDING','APPROVED','REJECTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, machine_id) REFERENCES machines(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((technician_id IS NOT NULL) <> (machine_id IS NOT NULL)),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS ix_calendar_exceptions_tenant ON calendar_exceptions(tenant_id);

-- R0 / Scheduling: Planned technician operation work slot.
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  technician_id TEXT NOT NULL,
  machine_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','PUBLISHED','ACKNOWLEDGED','ACTIVE','COMPLETED','CANCELLED')),
  published_at TEXT,
  published_by TEXT,
  revision_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, machine_id) REFERENCES machines(tenant_id, id) ON DELETE RESTRICT,
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS ix_assignments_tenant ON assignments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_assignments_1 ON assignments(tenant_id, operation_id,status);
CREATE INDEX IF NOT EXISTS ix_assignments_2 ON assignments(tenant_id, technician_id,start_at);

-- R0 / Scheduling: Committed exclusive person or machine block.
CREATE TABLE IF NOT EXISTS resource_reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL,
  technician_id TEXT,
  machine_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','RELEASED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, technician_id) REFERENCES technicians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, machine_id) REFERENCES machines(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((technician_id IS NOT NULL) <> (machine_id IS NOT NULL)),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS ix_resource_reservations_tenant ON resource_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_resource_reservations_1 ON resource_reservations(tenant_id, technician_id,start_at,end_at);
CREATE INDEX IF NOT EXISTS ix_resource_reservations_2 ON resource_reservations(tenant_id, machine_id,start_at,end_at);

-- R0 / Shop Floor: Append-only operator action and idempotency anchor.
CREATE TABLE IF NOT EXISTS production_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('START','PAUSE','RESUME','GOOD','REJECT','REWORK','BLOCK','UNBLOCK','COMPLETE')),
  event_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_production_events_tenant ON production_events(tenant_id);
CREATE INDEX IF NOT EXISTS ix_production_events_1 ON production_events(tenant_id, operation_id,event_at);
CREATE TRIGGER IF NOT EXISTS trg_production_events_no_update BEFORE UPDATE ON production_events BEGIN SELECT RAISE(ABORT,'production_events is append only'); END;
CREATE TRIGGER IF NOT EXISTS trg_production_events_no_delete BEFORE DELETE ON production_events BEGIN SELECT RAISE(ABORT,'production_events is append only'); END;

-- R0 / Shop Floor: Append-only quantity ledger; QC accepted is a separate process.
CREATE TABLE IF NOT EXISTS quantity_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  production_event_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('GOOD','REJECT','REWORK','REVERSAL')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reverses_movement_id TEXT,
  reason_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, production_event_id) REFERENCES production_events(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reverses_movement_id) REFERENCES quantity_movements(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,production_event_id,movement_type)
);

CREATE INDEX IF NOT EXISTS ix_quantity_movements_tenant ON quantity_movements(tenant_id);
CREATE INDEX IF NOT EXISTS ix_quantity_movements_1 ON quantity_movements(tenant_id, operation_id,movement_type);
CREATE TRIGGER IF NOT EXISTS trg_quantity_movements_no_update BEFORE UPDATE ON quantity_movements BEGIN SELECT RAISE(ABORT,'quantity_movements is append only'); END;
CREATE TRIGGER IF NOT EXISTS trg_quantity_movements_no_delete BEFORE DELETE ON quantity_movements BEGIN SELECT RAISE(ABORT,'quantity_movements is append only'); END;

-- R0 / Quality: QC batch/operation acceptance disposition.
CREATE TABLE IF NOT EXISTS quality_inspections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  inspector_user_id TEXT,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','INSPECTING','ACCEPTED','REJECTED','REWORK_REQUIRED')),
  inspected_qty INTEGER NOT NULL DEFAULT 0 CHECK (inspected_qty >= 0),
  accepted_qty INTEGER NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  rejected_qty INTEGER NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  rework_qty INTEGER NOT NULL DEFAULT 0 CHECK (rework_qty >= 0),
  inspected_at TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (inspector_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (accepted_qty + rejected_qty + rework_qty <= inspected_qty)
);

CREATE INDEX IF NOT EXISTS ix_quality_inspections_tenant ON quality_inspections(tenant_id);
CREATE INDEX IF NOT EXISTS ix_quality_inspections_1 ON quality_inspections(tenant_id, operation_id,state);

-- R1 / Quality: NCR, corrective action and reinspection record.
CREATE TABLE IF NOT EXISTS nonconformances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  inspection_id TEXT NOT NULL,
  ncr_no TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'OPEN',
  rework_operation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, inspection_id) REFERENCES quality_inspections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, rework_operation_id) REFERENCES operation_instances(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,ncr_no)
);

CREATE INDEX IF NOT EXISTS ix_nonconformances_tenant ON nonconformances(tenant_id);

-- R0 / Platform: Metadata only; binary object outside SQLite.
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  sha256 TEXT,
  access_class TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,storage_key)
);

CREATE INDEX IF NOT EXISTS ix_files_tenant ON files(tenant_id);

-- R0 / Platform: File relation to typed business target; authorization enforced in API.
CREATE TABLE IF NOT EXISTS entity_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  file_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  purpose TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, file_id) REFERENCES files(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_entity_attachments_tenant ON entity_attachments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_entity_attachments_1 ON entity_attachments(tenant_id, entity_type,entity_id);

-- R0 / Platform: Append-only critical business mutation record.
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  event_at TEXT NOT NULL,
  request_id TEXT,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_audit_events_tenant ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_1 ON audit_events(tenant_id, entity_type,entity_id,event_at);
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_events is append only'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit_events is append only'); END;

-- R0 / Platform: User-facing operational inbox.
CREATE TABLE IF NOT EXISTS notification_inbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'UNREAD',
  subject_type TEXT,
  subject_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_notification_inbox_tenant ON notification_inbox(tenant_id);
CREATE INDEX IF NOT EXISTS ix_notification_inbox_1 ON notification_inbox(tenant_id, user_id,status);

-- R1 / Materials: Reservations against material requirement.
CREATE TABLE IF NOT EXISTS material_reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  requirement_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  state TEXT NOT NULL DEFAULT 'RESERVED',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, requirement_id) REFERENCES material_requirements(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_material_reservations_tenant ON material_reservations(tenant_id);

-- R1 / Orders: Controlled order/engineering change and impact.
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  requested_by TEXT,
  reason TEXT NOT NULL,
  impact_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(impact_json)),
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES customer_orders(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_change_requests_tenant ON change_requests(tenant_id);

-- R1 / Orders: Shipment and proof-of-delivery header.
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  shipment_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  delivered_at TEXT,
  proof_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES customer_orders(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, proof_file_id) REFERENCES files(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,shipment_no)
);

CREATE INDEX IF NOT EXISTS ix_shipments_tenant ON shipments(tenant_id);

-- R1 / Orders: Quantity delivered per order item.
CREATE TABLE IF NOT EXISTS shipment_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  shipment_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, shipment_id) REFERENCES shipments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_shipment_lines_tenant ON shipment_lines(tenant_id);

-- R1 / Customer Portal: External user/customer access mapping.
CREATE TABLE IF NOT EXISTS customer_portal_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,user_id,customer_id)
);

CREATE INDEX IF NOT EXISTS ix_customer_portal_users_tenant ON customer_portal_users(tenant_id);

-- R1 / Quality: Batch or lot identity.
CREATE TABLE IF NOT EXISTS lot_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  lot_no TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,lot_no)
);

CREATE INDEX IF NOT EXISTS ix_lot_batches_tenant ON lot_batches(tenant_id);

-- R1 / Quality: Trace predecessor/consumed batches.
CREATE TABLE IF NOT EXISTS lot_genealogy (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  parent_lot_id TEXT NOT NULL,
  child_lot_id TEXT NOT NULL,
  quantity INTEGER CHECK (quantity > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, parent_lot_id) REFERENCES lot_batches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, child_lot_id) REFERENCES lot_batches(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,parent_lot_id,child_lot_id),
  CHECK (parent_lot_id <> child_lot_id)
);

CREATE INDEX IF NOT EXISTS ix_lot_genealogy_tenant ON lot_genealogy(tenant_id);

-- R1 / Scheduling: Revision and publication of production plans.
CREATE TABLE IF NOT EXISTS schedule_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  facility_id TEXT NOT NULL,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  published_at TEXT,
  published_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, facility_id) REFERENCES facilities(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,facility_id,version_no)
);

CREATE INDEX IF NOT EXISTS ix_schedule_versions_tenant ON schedule_versions(tenant_id);

-- R1 / Integration: Transactional outbox for integration events.
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  state TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id)
);

CREATE INDEX IF NOT EXISTS ix_outbox_events_tenant ON outbox_events(tenant_id);
CREATE INDEX IF NOT EXISTS ix_outbox_events_1 ON outbox_events(tenant_id, state,created_at);

-- R1 / CoreAI: Read-only grounded AI insight with source and model metadata.
CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_json)),
  model_name TEXT,
  generated_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id)
);

CREATE INDEX IF NOT EXISTS ix_ai_insights_tenant ON ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_insights_1 ON ai_insights(tenant_id, subject_type,subject_id);

-- R2 / Cost Intelligence: Cost ledger by production job and category.
CREATE TABLE IF NOT EXISTS job_cost_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('MATERIAL','LABOR','MACHINE','OUTSOURCE','SCRAP','REWORK')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ESTIMATE','ACTUAL')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES production_jobs(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_job_cost_entries_tenant ON job_cost_entries(tenant_id);

CREATE TRIGGER IF NOT EXISTS trg_resource_reservations_no_overlap_insert
BEFORE INSERT ON resource_reservations
WHEN NEW.status='CONFIRMED'
BEGIN
 SELECT RAISE(ABORT, 'resource reservation overlap')
 WHERE EXISTS (
   SELECT 1 FROM resource_reservations r
   WHERE r.tenant_id=NEW.tenant_id AND r.status='CONFIRMED'
     
     AND r.start_at < NEW.end_at AND NEW.start_at < r.end_at
     AND ((NEW.technician_id IS NOT NULL AND r.technician_id=NEW.technician_id)
          OR (NEW.machine_id IS NOT NULL AND r.machine_id=NEW.machine_id))
 );
END;

CREATE TRIGGER IF NOT EXISTS trg_resource_reservations_no_overlap_update
BEFORE UPDATE ON resource_reservations
WHEN NEW.status='CONFIRMED'
BEGIN
 SELECT RAISE(ABORT, 'resource reservation overlap')
 WHERE EXISTS (
   SELECT 1 FROM resource_reservations r
   WHERE r.tenant_id=NEW.tenant_id AND r.status='CONFIRMED'
      AND r.id <> NEW.id
     AND r.start_at < NEW.end_at AND NEW.start_at < r.end_at
     AND ((NEW.technician_id IS NOT NULL AND r.technician_id=NEW.technician_id)
          OR (NEW.machine_id IS NOT NULL AND r.machine_id=NEW.machine_id))
 );
END;

-- Critical invariants still require application transaction validators:
-- skill/certificate validity for entire slot, approved roster minus breaks/exceptions,
-- machine state, predecessor and material gates, quantity eligibility/QC, tenant authorization.
