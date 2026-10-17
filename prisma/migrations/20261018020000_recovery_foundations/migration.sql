ALTER TABLE "workspaces"
ADD COLUMN "max_overtime_minutes_per_day" INTEGER NOT NULL DEFAULT 240;

ALTER TABLE "workspaces"
ADD COLUMN "max_overtime_minutes_per_week" INTEGER NOT NULL DEFAULT 1200;

ALTER TABLE "memberships"
ADD COLUMN "job_title" TEXT;

ALTER TABLE "memberships"
ADD COLUMN "supervisor_membership_id" TEXT REFERENCES "memberships"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "memberships_supervisor_membership_id_idx"
ON "memberships"("supervisor_membership_id");

ALTER TABLE "machines"
ADD COLUMN "hourly_rate_cents" INTEGER;

ALTER TABLE "roster_intervals"
ADD COLUMN "approver_membership_id" TEXT REFERENCES "memberships"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "roster_intervals_approver_membership_id_idx"
ON "roster_intervals"("approver_membership_id");
