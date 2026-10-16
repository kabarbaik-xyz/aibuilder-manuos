-- CreateTable
CREATE TABLE "job_cost_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "task_id" TEXT,
    "cost_category" TEXT NOT NULL,
    "cost_type" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_cost_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_cost_entries_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "communication_consents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "is_opted_in" BOOLEAN NOT NULL DEFAULT true,
    "opted_in_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opted_out_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "communication_consents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "job_cost_entries_workspace_id_id_key" ON "job_cost_entries"("workspace_id", "id");
CREATE INDEX "job_cost_entries_workspace_id_order_id_cost_type_idx" ON "job_cost_entries"("workspace_id", "order_id", "cost_type");

-- CreateIndex
CREATE UNIQUE INDEX "communication_consents_workspace_id_id_key" ON "communication_consents"("workspace_id", "id");
CREATE UNIQUE INDEX "communication_consents_workspace_id_recipient_channel_key" ON "communication_consents"("workspace_id", "recipient", "channel");
