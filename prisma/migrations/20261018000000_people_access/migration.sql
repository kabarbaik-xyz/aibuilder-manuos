ALTER TABLE "memberships" ADD COLUMN "department_id" TEXT REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD COLUMN "landing_page" TEXT;
CREATE TRIGGER membership_department_insert BEFORE INSERT ON memberships
WHEN NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'Department must belong to membership workspace'); END;
CREATE TRIGGER membership_department_update BEFORE UPDATE OF department_id, workspace_id ON memberships
WHEN NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments WHERE id = NEW.department_id AND workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'Department must belong to membership workspace'); END;
CREATE TRIGGER membership_department_delete BEFORE DELETE ON departments
WHEN EXISTS (SELECT 1 FROM memberships WHERE department_id = OLD.id AND workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'Department is linked to workspace members'); END;
CREATE TRIGGER membership_department_owner_update BEFORE UPDATE OF id, workspace_id ON departments
WHEN (NEW.id != OLD.id OR NEW.workspace_id != OLD.workspace_id) AND EXISTS (SELECT 1 FROM memberships WHERE department_id = OLD.id AND workspace_id = OLD.workspace_id)
BEGIN SELECT RAISE(ABORT, 'Department with members cannot move workspace'); END;
-- Existing linked technicians retain their known organizational department.
UPDATE memberships SET department_id = (SELECT department_id FROM technicians WHERE technicians.id = memberships.technician_id AND technicians.workspace_id = memberships.workspace_id)
WHERE technician_id IS NOT NULL AND department_id IS NULL;
