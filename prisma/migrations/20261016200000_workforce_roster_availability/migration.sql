-- AlterTable: Remap skill scale_max to 4 and cap levels
UPDATE "skills" SET "scale_max" = 4 WHERE "scale_max" > 4;
UPDATE "technician_skills" SET "level" = 4 WHERE "level" > 4;

-- AlterTable: TechnicianSkill additive assessment tracking
ALTER TABLE "technician_skills" ADD COLUMN "assessment_status" TEXT NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE "technician_skills" ADD COLUMN "valid_from" DATETIME;
ALTER TABLE "technician_skills" ADD COLUMN "expires_at" DATETIME;
ALTER TABLE "technician_skills" ADD COLUMN "evidence" TEXT;
ALTER TABLE "technician_skills" ADD COLUMN "revoked_at" DATETIME;
ALTER TABLE "technician_skills" ADD COLUMN "revoked_by_id" TEXT;
ALTER TABLE "technician_skills" ADD COLUMN "notes" TEXT;

-- CreateTable: SkillAssessmentHistory
CREATE TABLE "skill_assessment_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "assessment_status" TEXT NOT NULL,
    "assessed_by" TEXT,
    "evidence" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_assessment_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "skill_assessment_history_workspace_id_technician_id_fkey" FOREIGN KEY ("workspace_id", "technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "skill_assessment_history_workspace_id_skill_id_fkey" FOREIGN KEY ("workspace_id", "skill_id") REFERENCES "skills" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "skill_assessment_history_workspace_id_technician_id_idx" ON "skill_assessment_history"("workspace_id", "technician_id");

-- AlterTable: TechnicianCertification additive fields
ALTER TABLE "technician_certifications" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "technician_certifications" ADD COLUMN "scope" TEXT;
ALTER TABLE "technician_certifications" ADD COLUMN "evidence" TEXT;
ALTER TABLE "technician_certifications" ADD COLUMN "valid_from_date" DATETIME;
ALTER TABLE "technician_certifications" ADD COLUMN "expires_at_date" DATETIME;
ALTER TABLE "technician_certifications" ADD COLUMN "revoked_at" DATETIME;
ALTER TABLE "technician_certifications" ADD COLUMN "revoked_by_id" TEXT;
ALTER TABLE "technician_certifications" ADD COLUMN "notes" TEXT;

-- Backfill valid_from_date and expires_at_date from issued_date and valid_until
UPDATE "technician_certifications"
SET "valid_from_date" = "issued_date" || 'T00:00:00.000Z',
    "expires_at_date" = "valid_until" || 'T23:59:59.999Z'
WHERE "issued_date" IS NOT NULL AND "valid_until" IS NOT NULL;

-- AlterTable: Machines additive capacity and capabilities
ALTER TABLE "machines" ADD COLUMN "capacity_units" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "machines" ADD COLUMN "capabilities_json" TEXT NOT NULL DEFAULT '[]';

-- CreateTable: MachineDowntime
CREATE TABLE "machine_downtimes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "start_at" DATETIME NOT NULL,
    "end_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "machine_downtimes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "machine_downtimes_workspace_id_machine_id_fkey" FOREIGN KEY ("workspace_id", "machine_id") REFERENCES "machines" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "machine_downtimes_workspace_id_machine_id_idx" ON "machine_downtimes"("workspace_id", "machine_id");

-- CreateTable: ShiftTemplate
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "facility_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "is_overnight" BOOLEAN NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_templates_workspace_id_facility_id_fkey" FOREIGN KEY ("workspace_id", "facility_id") REFERENCES "facilities" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shift_templates_workspace_id_code_key" ON "shift_templates"("workspace_id", "code");
CREATE UNIQUE INDEX "shift_templates_workspace_id_id_key" ON "shift_templates"("workspace_id", "id");

-- CreateTable: RosterInterval
CREATE TABLE "roster_intervals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "facility_id" TEXT,
    "technician_id" TEXT,
    "machine_id" TEXT,
    "shift_template_id" TEXT,
    "interval_type" TEXT NOT NULL DEFAULT 'SHIFT',
    "start_at" DATETIME NOT NULL,
    "end_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "break_intervals_json" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roster_intervals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_intervals_workspace_id_facility_id_fkey" FOREIGN KEY ("workspace_id", "facility_id") REFERENCES "facilities" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "roster_intervals_workspace_id_technician_id_fkey" FOREIGN KEY ("workspace_id", "technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_intervals_workspace_id_machine_id_fkey" FOREIGN KEY ("workspace_id", "machine_id") REFERENCES "machines" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_intervals_workspace_id_shift_template_id_fkey" FOREIGN KEY ("workspace_id", "shift_template_id") REFERENCES "shift_templates" ("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "roster_intervals_workspace_id_technician_id_start_at_end_at_idx" ON "roster_intervals"("workspace_id", "technician_id", "start_at", "end_at");
CREATE INDEX "roster_intervals_workspace_id_machine_id_start_at_end_at_idx" ON "roster_intervals"("workspace_id", "machine_id", "start_at", "end_at");
