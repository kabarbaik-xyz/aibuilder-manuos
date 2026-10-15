-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "form_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "definition_json" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "published_at" DATETIME,
    "published_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "form_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_versions_workspace_id_template_id_fkey" FOREIGN KEY ("workspace_id", "template_id") REFERENCES "form_templates" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_bindings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "order_type_id" TEXT,
    "workflow_node_key" TEXT,
    "workflow_version_id" TEXT,
    "qc_checklist_id" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "form_bindings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_bindings_workspace_id_form_version_id_fkey" FOREIGN KEY ("workspace_id", "form_version_id") REFERENCES "form_versions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "form_binding_id" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "form_instances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_instances_workspace_id_form_version_id_fkey" FOREIGN KEY ("workspace_id", "form_version_id") REFERENCES "form_versions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_instances_workspace_id_form_binding_id_fkey" FOREIGN KEY ("workspace_id", "form_binding_id") REFERENCES "form_bindings" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "answers_json" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "finalized_at" DATETIME,
    "supersedes_id" TEXT,
    "correction_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "form_submissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_submissions_workspace_id_instance_id_fkey" FOREIGN KEY ("workspace_id", "instance_id") REFERENCES "form_instances" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_submissions_workspace_id_supersedes_id_fkey" FOREIGN KEY ("workspace_id", "supersedes_id") REFERENCES "form_submissions" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "form_submission_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_submission_documents_workspace_id_submission_id_fkey" FOREIGN KEY ("workspace_id", "submission_id") REFERENCES "form_submissions" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form_submission_documents_workspace_id_document_id_fkey" FOREIGN KEY ("workspace_id", "document_id") REFERENCES "documents" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_workspace_id_code_key" ON "form_templates"("workspace_id", "code");
CREATE UNIQUE INDEX "form_templates_workspace_id_id_key" ON "form_templates"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_template_id_version_number_key" ON "form_versions"("template_id", "version_number");
CREATE UNIQUE INDEX "form_versions_workspace_id_id_key" ON "form_versions"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_bindings_workspace_id_id_key" ON "form_bindings"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_instances_workspace_id_subject_type_subject_id_form_version_id_key" ON "form_instances"("workspace_id", "subject_type", "subject_id", "form_version_id");
CREATE UNIQUE INDEX "form_instances_workspace_id_id_key" ON "form_instances"("workspace_id", "id");
CREATE INDEX "form_instances_workspace_id_subject_type_subject_id_idx" ON "form_instances"("workspace_id", "subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_instance_id_sequence_number_key" ON "form_submissions"("instance_id", "sequence_number");
CREATE UNIQUE INDEX "form_submissions_workspace_id_id_key" ON "form_submissions"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submission_documents_workspace_id_id_key" ON "form_submission_documents"("workspace_id", "id");
CREATE INDEX "form_submission_documents_workspace_id_submission_id_idx" ON "form_submission_documents"("workspace_id", "submission_id");
