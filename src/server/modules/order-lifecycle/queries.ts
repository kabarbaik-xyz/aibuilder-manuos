import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError } from '@/domain/errors';

const lifecycleReadPermissions = [
  'order.read', 'order.create', 'order.write', 'engineering.approve', 'planning.read', 'planning.write',
  'task.assign', 'task.execute_assigned', 'quality.read', 'quality.inspect',
  'delivery.read', 'delivery.dispatch', 'workflow.author', 'workspace.admin',
];

/** Lists only lifecycle work assigned to this membership or its eligible department queue. */
export async function listLifecycleWorkItems(
  db: PrismaClient,
  principal: Principal,
  scope: 'mine' | 'department' = 'mine'
) {
  requireAnyPermission(principal, lifecycleReadPermissions);
  if (scope === 'department' && !principal.departmentId) {
    throw new BadRequestError('Your membership is not assigned to a department.');
  }
  const canReassign = principal.permissions.has('workflow.author') || principal.permissions.has('workspace.admin');

  const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
  const stages = await db.orderLifecycleStage.findMany({
    where: {
      workspaceId: principal.workspaceId,
      state: { in: ['READY', 'ACTIVE', 'BLOCKED', 'WAITING_APPROVAL'] },
      ...(scope === 'department'
        ? { departmentId: principal.departmentId! }
        : { OR: [
            { assignedMembershipId: principal.membershipId },
            ...(principal.departmentId ? [{ departmentId: principal.departmentId }] : []),
          ] }),
      instance: {
        status: 'ACTIVE',
        order: {
          ...(principal.roles.includes('OWNER') ? {} : { facilityId: { in: facilityIds } }),
        },
      },
    },
    include: {
      department: { select: { id: true, name: true } },
      assignedMembership: { select: { id: true, user: { select: { name: true } } } },
      instance: {
        select: {
          order: { select: {
            id: true, orderNumber: true, facilityId: true,
            customer: { select: { name: true } }, item: { select: { name: true } },
            instances: { select: { tasks: { select: {
              id: true, nodeKey: true, status: true,
              resourceBookings: { where: { status: 'CONFIRMED' }, select: { id: true, resourceType: true, startAt: true, endAt: true } },
            } } } },
          } },
          workflowVersion: { select: { versionNumber: true, template: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
  });

  return stages.flatMap((stage) => {
    const assignment = JSON.parse(stage.assignmentJson) as
      | { kind: 'MEMBER'; membershipId: string }
      | { kind: 'DEPARTMENT_QUEUE'; departmentId: string; eligibleRoleCodes: string[] };
    const personallyAssigned = stage.assignedMembershipId === principal.membershipId ||
      (assignment.kind === 'MEMBER' && assignment.membershipId === principal.membershipId);
    const roleEligible = assignment.kind === 'DEPARTMENT_QUEUE'
      && assignment.departmentId === principal.departmentId
      && (!stage.assignedMembershipId || stage.assignedMembershipId === principal.membershipId)
      && assignment.eligibleRoleCodes.some((roleCode) => principal.roles.includes(roleCode));
    const managerDepartmentView = scope === 'department' && canReassign;
    if (scope === 'department' ? !managerDepartmentView && !roleEligible : !personallyAssigned && !roleEligible) return [];

    return [{
      id: stage.id,
      version: stage.version,
      orderId: stage.instance.order.id,
      orderNumber: stage.instance.order.orderNumber,
      customerName: stage.instance.order.customer.name,
      itemName: stage.instance.order.item.name,
      workflowName: stage.instance.workflowVersion.template.name,
      workflowVersion: stage.instance.workflowVersion.versionNumber,
      key: stage.stageKey,
      name: stage.name,
      action: stage.action,
      state: stage.state,
      department: stage.department,
      assignedTo: stage.assignedMembership?.user.name ?? null,
      dueAt: stage.dueAt?.toISOString() ?? null,
      schedule: JSON.parse(stage.scheduleJson),
      formPins: JSON.parse(stage.formPinsJson),
      scheduledWork: stage.instance.order.instances.flatMap((instance) => instance.tasks.map((task) => ({
        taskId: task.id,
        operation: task.nodeKey,
        status: task.status,
        bookings: task.resourceBookings.map((booking) => ({
          id: booking.id,
          resourceType: booking.resourceType,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
        })),
      }))),
      predecessorKeys: JSON.parse(stage.predecessorKeysJson),
      assignmentKind: assignment.kind,
      claimedByMe: stage.assignedMembershipId === principal.membershipId,
      canReassign,
    }];
  });
}

export async function listLifecycleDepartmentMembers(
  db: PrismaClient,
  principal: Principal,
  departmentId: string
) {
  requireAnyPermission(principal, ['workflow.author', 'workspace.admin']);
  if (!departmentId) throw new BadRequestError('Choose a department before selecting an assignee.');
  const department = await db.department.findFirst({
    where: { id: departmentId, workspaceId: principal.workspaceId, isActive: true, archivedAt: null },
    select: { id: true },
  });
  if (!department) throw new BadRequestError('Choose an active department in this workspace.');
  const memberships = await db.membership.findMany({
    where: { workspaceId: principal.workspaceId, departmentId, status: 'ACTIVE' },
    select: { id: true, user: { select: { name: true } }, roles: { where: { role: { isActive: true } }, select: { role: { select: { code: true, name: true } } } } },
    orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
  });
  return memberships.map((membership) => ({
    membershipId: membership.id,
    name: membership.user.name,
    roles: membership.roles.map((grant) => ({ code: grant.role.code, name: grant.role.name })),
  }));
}
