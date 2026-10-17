CREATE TABLE "assistant_chat_entries" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
 "membership_id" TEXT NOT NULL REFERENCES "memberships"("id") ON DELETE RESTRICT,
 "scope_hash" TEXT NOT NULL,
 "message_json" TEXT NOT NULL,
 "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "assistant_chat_entries_workspace_id_membership_id_created_at_idx" ON "assistant_chat_entries"("workspace_id", "membership_id", "created_at");
