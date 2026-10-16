-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes_json" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" DATETIME,
    "last_used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events_json" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "webhook_endpoints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "endpoint_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status_code" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "error_reason" TEXT,
    "delivered_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "webhook_deliveries_workspace_id_endpoint_id_fkey" FOREIGN KEY ("workspace_id", "endpoint_id") REFERENCES "webhook_endpoints" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "offline_sync_queues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "command_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_reason" TEXT,
    "applied_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "offline_sync_queues_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_workspace_id_id_key" ON "api_keys"("workspace_id", "id");
CREATE INDEX "api_keys_workspace_id_key_prefix_idx" ON "api_keys"("workspace_id", "key_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_workspace_id_id_key" ON "webhook_endpoints"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_workspace_id_id_key" ON "webhook_deliveries"("workspace_id", "id");
CREATE INDEX "webhook_deliveries_workspace_id_endpoint_id_idx" ON "webhook_deliveries"("workspace_id", "endpoint_id");

-- CreateIndex
CREATE UNIQUE INDEX "offline_sync_queues_workspace_id_id_key" ON "offline_sync_queues"("workspace_id", "id");
CREATE UNIQUE INDEX "offline_sync_queues_workspace_id_idempotency_key_key" ON "offline_sync_queues"("workspace_id", "idempotency_key");
CREATE INDEX "offline_sync_queues_workspace_id_user_id_status_idx" ON "offline_sync_queues"("workspace_id", "user_id", "status");
