-- CreateTable
CREATE TABLE "resource_bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "start_at" DATETIME NOT NULL,
    "end_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_bookings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "resource_bookings_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "session_type" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "ended_at" DATETIME,
    "duration_minutes" INTEGER,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_sessions_workspace_id_task_id_fkey" FOREIGN KEY ("workspace_id", "task_id") REFERENCES "tasks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_sessions_workspace_id_technician_id_fkey" FOREIGN KEY ("workspace_id", "technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_bookings_workspace_id_id_key" ON "resource_bookings"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "resource_bookings_workspace_id_resource_type_resource_id_idx" ON "resource_bookings"("workspace_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_workspace_id_id_key" ON "work_sessions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "work_sessions_workspace_id_task_id_idx" ON "work_sessions"("workspace_id", "task_id");
