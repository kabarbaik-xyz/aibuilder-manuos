import { ForbiddenError } from '@/domain/errors';
import { Principal } from './principal';
import { PrismaClient } from '@prisma/client';

export function assertCustomerOwnership(
  principal: Principal,
  resourceCustomerId: string | null | undefined
): void {
  // If principal is a customer portal user, resource MUST match their customerId
  if (principal.customerId) {
    if (!resourceCustomerId || principal.customerId !== resourceCustomerId) {
      throw new ForbiddenError(
        'Access denied: customer cannot view or modify records belonging to other accounts'
      );
    }
  }
}

export function assertTechnicianOwnership(
  principal: Principal,
  assignedTechnicianId: string | null | undefined
): void {
  // If principal is restricted to assigned technician tasks
  if (principal.technicianId && !principal.permissions.has('task.assign')) {
    if (!assignedTechnicianId || principal.technicianId !== assignedTechnicianId) {
      throw new ForbiddenError(
        'Access denied: technician can only execute tasks directly assigned to them'
      );
    }
  }
}

export async function assertNotLastAccessAdmin(
  db: PrismaClient,
  workspaceId: string,
  targetMembershipId: string
): Promise<void> {
  const activeAdmins = await db.membershipRole.count({
    where: {
      workspaceId,
      role: { code: 'ACCESS_ADMIN', isActive: true },
      membership: {
        id: { not: targetMembershipId },
        status: 'ACTIVE',
      },
    },
  });

  if (activeAdmins === 0) {
    throw new ForbiddenError(
      'Cannot disable membership or revoke role: at least one active ACCESS_ADMIN must remain in the workspace'
    );
  }
}
