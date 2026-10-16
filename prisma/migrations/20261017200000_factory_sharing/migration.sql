-- CreateTable
CREATE TABLE "factory_share_consents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "partner_workspace_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "note" TEXT,
    "proposed_by_id" TEXT NOT NULL,
    "accepted_by_id" TEXT,
    "accepted_at" DATETIME,
    "revoked_by_id" TEXT,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "factory_share_consents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "factory_share_consents_partner_workspace_id_fkey" FOREIGN KEY ("partner_workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shared_capacity_commitments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "consent_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource_key" TEXT NOT NULL,
    "quantity_atoms" BIGINT NOT NULL,
    "window_start" DATETIME NOT NULL,
    "window_end" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "offered_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shared_capacity_commitments_consent_id_fkey" FOREIGN KEY ("workspace_id", "consent_id") REFERENCES "factory_share_consents" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shared_capacity_commitments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "factory_share_consents_workspace_id_partner_workspace_id_scope_key" ON "factory_share_consents"("workspace_id", "partner_workspace_id", "scope");

-- CreateIndex
CREATE INDEX "shared_capacity_commitments_workspace_id_consent_id_idx" ON "shared_capacity_commitments"("workspace_id", "consent_id");

-- CreateIndex
CREATE UNIQUE INDEX "factory_share_consents_workspace_id_id_key" ON "factory_share_consents"("workspace_id", "id");
