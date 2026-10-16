-- CreateTable
CREATE TABLE "task_issues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "issue_reason_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "owner_user_id" TEXT,
    "reporter_user_id" TEXT NOT NULL,
    "expected_resolution_at" DATETIME,
    "resolved_at" DATETIME,
    "evidence_json" TEXT DEFAULT '[]',
    "history_json" TEXT DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "task_issues_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_issues_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_issues_workspace_id_issue_reason_id_fkey" FOREIGN KEY ("workspace_id", "issue_reason_id") REFERENCES "issue_reasons" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_issues_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "task_issues_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "task_issues_workspace_id_id_key" ON "task_issues"("workspace_id", "id");
CREATE INDEX "task_issues_workspace_id_task_id_idx" ON "task_issues"("workspace_id", "task_id");
CREATE UNIQUE INDEX "issue_reasons_workspace_id_id_key" ON "issue_reasons"("workspace_id", "id");
