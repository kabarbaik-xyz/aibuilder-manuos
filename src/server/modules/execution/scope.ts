import type { Prisma } from '@prisma/client';
import type { Principal } from '@/server/auth/principal';
import { hasPermission } from '@/server/auth/permissions';

export function executionTaskScope(principal: Principal): Prisma.TaskWhereInput {
  const supervisor = ['task.assign', 'planning.read', 'planning.write', 'workspace.admin', 'quality.read', 'document.read', 'traceability.read', 'admin.access'].some((permission) => hasPermission(principal, permission));
  return {
    workspaceId: principal.workspaceId,
    instance: { is: { order: { is: { facilityId: { in: principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []) } } } } },
    ...(!supervisor ? { assignedTechnicianId: principal.technicianId ?? '__no_assigned_technician__' } : {}),
  };
}
