-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "customer_contacts_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "lead_time_days" INTEGER NOT NULL DEFAULT 7 CHECK ("lead_time_days" >= 0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "suppliers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "uoms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT 'PIECE',
    "precision" INTEGER NOT NULL DEFAULT 0 CHECK ("precision" >= 0 AND "precision" <= 6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "uoms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "item_type" TEXT NOT NULL CHECK ("item_type" IN ('RAW', 'COMPONENT', 'WIP', 'FINISHED')),
    "base_uom_id" TEXT NOT NULL,
    "tracking" TEXT NOT NULL DEFAULT 'NONE' CHECK ("tracking" IN ('NONE', 'LOT', 'SERIAL')),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "items_workspace_id_base_uom_id_fkey" FOREIGN KEY ("workspace_id", "base_uom_id") REFERENCES "uoms" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "item_uom_conversions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "input_uom_id" TEXT NOT NULL,
    "ratio_numerator" INTEGER NOT NULL CHECK ("ratio_numerator" > 0),
    "ratio_denominator" INTEGER NOT NULL CHECK ("ratio_denominator" > 0),
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "item_uom_conversions_workspace_id_item_id_fkey" FOREIGN KEY ("workspace_id", "item_id") REFERENCES "items" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_uom_conversions_workspace_id_input_uom_id_fkey" FOREIGN KEY ("workspace_id", "input_uom_id") REFERENCES "uoms" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "warehouse_group" TEXT NOT NULL DEFAULT 'DEFAULT',
    "kind" TEXT NOT NULL CHECK ("kind" IN ('RAW', 'WIP', 'QUARANTINE', 'FG', 'EXTERNAL', 'CONSUMED', 'SCRAP', 'CUSTOMER')),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "locations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "departments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_calendars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "weekly_shifts_json" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "work_calendars_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "calendar_exceptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "working_intervals_json" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "calendar_exceptions_workspace_id_calendar_id_fkey" FOREIGN KEY ("workspace_id", "calendar_id") REFERENCES "work_calendars" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "machine_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capabilities_json" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "machine_classes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machine_class_id" TEXT NOT NULL,
    "department_id" TEXT,
    "calendar_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK ("status" IN ('AVAILABLE', 'MAINTENANCE', 'OFFLINE')),
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "machines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "machines_workspace_id_machine_class_id_fkey" FOREIGN KEY ("workspace_id", "machine_class_id") REFERENCES "machine_classes" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "machines_workspace_id_department_id_fkey" FOREIGN KEY ("workspace_id", "department_id") REFERENCES "departments" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "machines_workspace_id_calendar_id_fkey" FOREIGN KEY ("workspace_id", "calendar_id") REFERENCES "work_calendars" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" TEXT,
    "calendar_id" TEXT,
    "max_weekly_minutes" INTEGER NOT NULL DEFAULT 2400 CHECK ("max_weekly_minutes" >= 0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "technicians_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "technicians_workspace_id_department_id_fkey" FOREIGN KEY ("workspace_id", "department_id") REFERENCES "departments" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "technicians_workspace_id_calendar_id_fkey" FOREIGN KEY ("workspace_id", "calendar_id") REFERENCES "work_calendars" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scale_max" INTEGER NOT NULL DEFAULT 5 CHECK ("scale_max" >= 1),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "skills_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "technician_skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL CHECK ("level" >= 1),
    "assessed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessed_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "technician_skills_workspace_id_technician_id_fkey" FOREIGN KEY ("workspace_id", "technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "technician_skills_workspace_id_skill_id_fkey" FOREIGN KEY ("workspace_id", "skill_id") REFERENCES "skills" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "certifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "technician_certifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "certification_id" TEXT NOT NULL,
    "certificate_number" TEXT,
    "issued_date" TEXT NOT NULL,
    "valid_until" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "technician_certifications_workspace_id_technician_id_fkey" FOREIGN KEY ("workspace_id", "technician_id") REFERENCES "technicians" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "technician_certifications_workspace_id_certification_id_fkey" FOREIGN KEY ("workspace_id", "certification_id") REFERENCES "certifications" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "order_types" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_template_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "order_types_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "qc_checklists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "qc_checklists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "qc_checklist_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "method" TEXT NOT NULL CHECK ("method" IN ('VISUAL', 'MEASUREMENT', 'FUNCTIONAL', 'GAUGE')),
    "unit" TEXT,
    "limits_json" TEXT NOT NULL DEFAULT '{}',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "qc_checklist_checks_workspace_id_checklist_id_fkey" FOREIGN KEY ("workspace_id", "checklist_id") REFERENCES "qc_checklists" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Redefine memberships table to link customer_id
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_memberships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'DISABLED')),
    "customer_id" TEXT,
    "technician_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_memberships" ("created_at", "customer_id", "id", "status", "technician_id", "updated_at", "user_id", "version", "workspace_id") SELECT "created_at", "customer_id", "id", "status", "technician_id", "updated_at", "user_id", "version", "workspace_id" FROM "memberships";
DROP TABLE "memberships";
ALTER TABLE "new_memberships" RENAME TO "memberships";
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");
CREATE UNIQUE INDEX "memberships_workspace_id_id_key" ON "memberships"("workspace_id", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Create Indexes
CREATE UNIQUE INDEX "customers_workspace_id_code_key" ON "customers"("workspace_id", "code");
CREATE UNIQUE INDEX "customers_workspace_id_id_key" ON "customers"("workspace_id", "id");

CREATE UNIQUE INDEX "suppliers_workspace_id_code_key" ON "suppliers"("workspace_id", "code");
CREATE UNIQUE INDEX "suppliers_workspace_id_id_key" ON "suppliers"("workspace_id", "id");

CREATE UNIQUE INDEX "uoms_workspace_id_code_key" ON "uoms"("workspace_id", "code");
CREATE UNIQUE INDEX "uoms_workspace_id_id_key" ON "uoms"("workspace_id", "id");

CREATE UNIQUE INDEX "items_workspace_id_code_key" ON "items"("workspace_id", "code");
CREATE UNIQUE INDEX "items_workspace_id_id_key" ON "items"("workspace_id", "id");

CREATE UNIQUE INDEX "item_uom_conversions_workspace_id_item_id_input_uom_id_key" ON "item_uom_conversions"("workspace_id", "item_id", "input_uom_id");

CREATE UNIQUE INDEX "locations_workspace_id_code_key" ON "locations"("workspace_id", "code");
CREATE UNIQUE INDEX "locations_workspace_id_id_key" ON "locations"("workspace_id", "id");

CREATE UNIQUE INDEX "departments_workspace_id_code_key" ON "departments"("workspace_id", "code");
CREATE UNIQUE INDEX "departments_workspace_id_id_key" ON "departments"("workspace_id", "id");

CREATE UNIQUE INDEX "work_calendars_workspace_id_code_key" ON "work_calendars"("workspace_id", "code");
CREATE UNIQUE INDEX "work_calendars_workspace_id_id_key" ON "work_calendars"("workspace_id", "id");

CREATE UNIQUE INDEX "calendar_exceptions_workspace_id_calendar_id_date_key" ON "calendar_exceptions"("workspace_id", "calendar_id", "date");

CREATE UNIQUE INDEX "machine_classes_workspace_id_code_key" ON "machine_classes"("workspace_id", "code");
CREATE UNIQUE INDEX "machine_classes_workspace_id_id_key" ON "machine_classes"("workspace_id", "id");

CREATE UNIQUE INDEX "machines_workspace_id_code_key" ON "machines"("workspace_id", "code");
CREATE UNIQUE INDEX "machines_workspace_id_id_key" ON "machines"("workspace_id", "id");

CREATE UNIQUE INDEX "technicians_membership_id_key" ON "technicians"("membership_id");
CREATE UNIQUE INDEX "technicians_workspace_id_code_key" ON "technicians"("workspace_id", "code");
CREATE UNIQUE INDEX "technicians_workspace_id_id_key" ON "technicians"("workspace_id", "id");

CREATE UNIQUE INDEX "skills_workspace_id_code_key" ON "skills"("workspace_id", "code");
CREATE UNIQUE INDEX "skills_workspace_id_id_key" ON "skills"("workspace_id", "id");

CREATE UNIQUE INDEX "technician_skills_technician_id_skill_id_key" ON "technician_skills"("technician_id", "skill_id");

CREATE UNIQUE INDEX "certifications_workspace_id_code_key" ON "certifications"("workspace_id", "code");
CREATE UNIQUE INDEX "certifications_workspace_id_id_key" ON "certifications"("workspace_id", "id");

CREATE UNIQUE INDEX "technician_certifications_technician_id_certification_id_key" ON "technician_certifications"("technician_id", "certification_id");

CREATE UNIQUE INDEX "order_types_workspace_id_code_key" ON "order_types"("workspace_id", "code");
CREATE UNIQUE INDEX "order_types_workspace_id_id_key" ON "order_types"("workspace_id", "id");

CREATE UNIQUE INDEX "qc_checklists_workspace_id_code_revision_key" ON "qc_checklists"("workspace_id", "code", "revision");
CREATE UNIQUE INDEX "qc_checklists_workspace_id_id_key" ON "qc_checklists"("workspace_id", "id");

CREATE UNIQUE INDEX "qc_checklist_checks_checklist_id_code_key" ON "qc_checklist_checks"("checklist_id", "code");
