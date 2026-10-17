ALTER TABLE "recovery_proposals" ADD COLUMN "approver_membership_id" TEXT REFERENCES "memberships"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "recovery_proposals_approver_membership_id_idx" ON "recovery_proposals"("approver_membership_id");

CREATE INDEX "recovery_proposals_workspace_id_approver_membership_id_status_idx" ON "recovery_proposals"("workspace_id", "approver_membership_id", "status");
