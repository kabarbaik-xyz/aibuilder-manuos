import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PlanningService } from '@/server/modules/planning/service';
import { PortalRepository } from '@/server/modules/portal/repository';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/domain/errors';

const inputSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().refine(n => [10, 25, 50, 100].includes(n)).default(10),
  search: z.string().trim().max(200).default(''),
});

/** Paginated workspace read models. Count and page share a SQLite snapshot;
 * permissions and tenant filters are applied before either database query. */
export async function readList(db: PrismaClient, principal: Principal, resource: string, params: URLSearchParams) {
  const parsed = inputSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new BadRequestError('Invalid page, pageSize or search parameters');
  const { page: requestedPage, pageSize, search } = parsed.data;
  const workspaceId = principal.workspaceId;
  const status = params.get('status') || undefined;
  if (resource === 'planning') requireAnyPermission(principal, ['planning.read', 'order.read', 'task.assign']);
  const schedule = resource === 'planning' ? await new PlanningService(db).scheduleTasks(principal, {}) : undefined;
  return db.$transaction(async tx => {
    async function page<T>(count: () => Promise<number>, read: (skip: number, take: number) => Promise<T[]>, map?: (row: T) => unknown) {
      const total = await count();
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(requestedPage, totalPages);
      const rows = await read((currentPage - 1) * pageSize, pageSize);
      return { data: map ? rows.map(map) : rows, pagination: { page: currentPage, pageSize, total, totalPages } };
    }
    switch (resource) {
      case 'customers': {
        requireAnyPermission(principal, ['customer.read', 'customer.manage']);
        const where: Prisma.CustomerWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.customer.count({ where }), (skip, take) => tx.customer.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { contacts: true } }));
      }
      case 'suppliers': {
        requireAnyPermission(principal, ['supplier.read', 'supplier.manage']);
        const where: Prisma.SupplierWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.supplier.count({ where }), (skip, take) => tx.supplier.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'items': {
        requireAnyPermission(principal, ['inventory.read', 'item.manage']);
        const where: Prisma.ItemWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        const types: Record<string, string> = { RAW_MATERIAL: 'RAW', FINISHED_GOOD: 'FINISHED', SUBASSEMBLY: 'WIP', COMPONENT: 'COMPONENT' };
        if (params.get('type')) where.itemType = types[params.get('type')!] || params.get('type')!;
        return page(() => tx.item.count({ where }), (skip, take) => tx.item.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { baseUom: true } }));
      }
      case 'locations': {
        requireAnyPermission(principal, ['inventory.read', 'location.manage']);
        const where: Prisma.LocationWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        if (params.get('type')) where.kind = params.get('type') === 'FINISHED_GOODS' ? 'FG' : params.get('type')!;
        return page(() => tx.location.count({ where }), (skip, take) => tx.location.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'uoms': {
        requireAnyPermission(principal, ['inventory.read', 'item.manage']);
        const where: Prisma.UomWhereInput = { workspaceId, isActive: true, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.uom.count({ where }), (skip, take) => tx.uom.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'departments': {
        requireAnyPermission(principal, ['resource.manage']);
        const where: Prisma.DepartmentWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.department.count({ where }), (skip, take) => tx.department.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'calendars': {
        requireAnyPermission(principal, ['resource.manage', 'planning.read']);
        const where: Prisma.WorkCalendarWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.workCalendar.count({ where }), (skip, take) => tx.workCalendar.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'machines': {
        requireAnyPermission(principal, ['resource.manage', 'planning.read']);
        const where: Prisma.MachineWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { machineClass: { code: { contains: search } } }, { machineClass: { name: { contains: search } } }] } : {}) };
        if (params.get('departmentId')) where.departmentId = params.get('departmentId')!;
        return page(() => tx.machine.count({ where }), (skip, take) => tx.machine.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { machineClass: true, department: true } }));
      }
      case 'technicians': {
        requireAnyPermission(principal, ['resource.manage', 'planning.read']);
        const where: Prisma.TechnicianWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { skills: { some: { skill: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } } }] } : {}) };
        return page(() => tx.technician.count({ where }), (skip, take) => tx.technician.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { skills: { include: { skill: true } }, certifications: { include: { certification: true } } } }));
      }
      case 'skills': {
        requireAnyPermission(principal, ['resource.manage']);
        const where: Prisma.SkillWhereInput = { workspaceId, isActive: true,  ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.skill.count({ where }), (skip, take) => tx.skill.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'order-types': {
        requireAnyPermission(principal, ['workflow.read', 'workflow.author', 'order.read']);
        const where: Prisma.OrderTypeWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { description: { contains: search } }] } : {}) };
        return page(() => tx.orderType.count({ where }), (skip, take) => tx.orderType.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }] }));
      }
      case 'qc-checklists': {
        requireAnyPermission(principal, ['quality.read', 'quality.configure']);
        const where: Prisma.QcChecklistWhereInput = { workspaceId, archivedAt: null, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }, { checks: { some: { OR: [{ code: { contains: search } }, { description: { contains: search } }] } } }] } : {}) };
        return page(() => tx.qcChecklist.count({ where }), (skip, take) => tx.qcChecklist.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { checks: true } }));
      }
      case 'orders':
      case 'engineering': {
        requireAnyPermission(principal, ['order.read', 'customer_order.read_own']);
        const where: Prisma.OrderWhereInput = { workspaceId, ...(principal.customerId ? { customerId: principal.customerId } : {}), ...(status ? { status } : {}), ...(search ? { OR: [{ orderNumber: { contains: search } }, { customer: { name: { contains: search } } }, { item: { name: { contains: search } } }] } : {}) };
        return page(() => tx.order.count({ where }), (skip, take) => tx.order.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { customer: true, item: { include: { baseUom: true } }, orderType: true, questions: { where: { status: 'OPEN' } }, engineeringRevisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } } }));
      }
      case 'supply-orders': {
        requireAnyPermission(principal, ['supply.read']);
        const where: Prisma.SupplyOrderWhereInput = { workspaceId, ...(status ? { status } : {}), ...(search ? { OR: [{ orderNumber: { contains: search } }, { supplier: { name: { contains: search } } }, { supplier: { code: { contains: search } } }, { lines: { some: { item: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } } }] } : {}) };
        return page(() => tx.supplyOrder.count({ where }), (skip, take) => tx.supplyOrder.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { supplier: true, lines: { include: { item: true } } } }), row => ({ ...row, supplierName: row.supplier.name, supplierCode: row.supplier.code, lines: row.lines.map(line => ({ ...line, itemCode: line.item.code, itemName: line.item.name, openAtoms: line.orderedAtoms - line.receivedAtoms })) }));
      }
      case 'receipts': {
        requireAnyPermission(principal, ['inventory.read']);
        const where: Prisma.SupplyReceiptWhereInput = { workspaceId, ...(search ? { OR: [{ receiptNumber: { contains: search } }, { notes: { contains: search } }, { supplyOrder: { orderNumber: { contains: search } } }, { supplier: { name: { contains: search } } }, { lines: { some: { item: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } } }] } : {}) };
        return page(() => tx.supplyReceipt.count({ where }), (skip, take) => tx.supplyReceipt.findMany({ where, skip, take, orderBy: [{ receivedDate: 'desc' }, { id: 'desc' }], include: { supplyOrder: true, supplier: true, receivedBy: { select: { name: true } }, lines: { include: { item: true, location: true, lot: true } } } }), row => ({ ...row, orderNumber: row.supplyOrder.orderNumber, supplierName: row.supplier.name, receivedByName: row.receivedBy.name, lines: row.lines.map(line => ({ ...line, itemCode: line.item.code, itemName: line.item.name, locationCode: line.location.code, lotNumber: line.lot?.lotNumber })) }));
      }
      case 'inspections': {
        requireAnyPermission(principal, ['quality.read', 'quality.inspect']);
        const where: Prisma.InspectionWhereInput = {
          workspaceId,
          ...(status ? { status } : {}),
          ...(search ? {
            OR: [
              { id: { contains: search } },
              { sourceType: { contains: search } },
              { disposition: { contains: search } },
              { productionOutput: { item: { name: { contains: search } } } },
              { productionOutput: { lot: { lotNumber: { contains: search } } } },
              {
                productionOutput: {
                  task: {
                    instance: {
                      order: { orderNumber: { contains: search } },
                    },
                  },
                },
              },
            ],
          } : {}),
        };
        return page(() => tx.inspection.count({ where }), (skip, take) => tx.inspection.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { productionOutput: { include: { item: true, lot: true, task: { include: { instance: { include: { order: true } } } } } } } }));
      }
      case 'shipments': {
        requireAnyPermission(principal, ['delivery.read', 'order.read']);
        const where: Prisma.ShipmentWhereInput = { workspaceId, ...(principal.customerId ? { customerId: principal.customerId } : {}), ...(status ? { status } : {}), ...(search ? { OR: [{ shipmentNumber: { contains: search } }, { carrierName: { contains: search } }, { trackingNumber: { contains: search } }, { customer: { name: { contains: search } } }, { order: { orderNumber: { contains: search } } }, { order: { item: { name: { contains: search } } } }] } : {}) };
        return page(() => tx.shipment.count({ where }), (skip, take) => tx.shipment.findMany({ where, skip, take, orderBy: [{ allocatedAt: 'desc' }, { id: 'desc' }], include: { customer: true, order: { include: { item: true } }, lines: true } }));
      }
      case 'stock-balances': {
        requireAnyPermission(principal, ['inventory.read']);
        const locationSearch = params.get('locationSearch') || '';
        const where: Prisma.StockBalanceWhereInput = { workspaceId, OR: [{ onHandAtoms: { gt: 0n } }, { reservedAtoms: { gt: 0n } }], ...(search ? { item: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } : {}), ...(locationSearch ? { location: { OR: [{ code: { contains: locationSearch } }, { name: { contains: locationSearch } }] } } : {}) };
        return page(() => tx.stockBalance.count({ where }), (skip, take) => tx.stockBalance.findMany({ where, skip, take, orderBy: [{ item: { code: 'asc' } }, { location: { code: 'asc' } }, { id: 'asc' }], include: { item: true, location: true, lot: true } }), row => ({ ...row, itemCode: row.item.code, itemName: row.item.name, locationCode: row.location.code, locationName: row.location.name, locationKind: row.location.kind, lotNumber: row.lot?.lotNumber, availableAtoms: row.onHandAtoms - row.reservedAtoms }));
      }
      case 'stock-movements': {
        requireAnyPermission(principal, ['inventory.read']);
        const movementType = params.get('movementType');
        const where: Prisma.StockMovementWhereInput = { workspaceId, ...(movementType ? { movementType } : {}), ...(search ? { item: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } : {}) };
        return page(() => tx.stockMovement.count({ where }), (skip, take) => tx.stockMovement.findMany({ where, skip, take, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], include: { item: true, sourceLocation: true, destinationLocation: true, sourceLot: true, destinationLot: true, actorUser: { select: { name: true } } } }), row => ({ ...row, itemCode: row.item.code, itemName: row.item.name, sourceLocationCode: row.sourceLocation?.code, destinationLocationCode: row.destinationLocation?.code, sourceLotNumber: row.sourceLot?.lotNumber, destinationLotNumber: row.destinationLot?.lotNumber, actorName: row.actorUser.name }));
      }
      case 'stock-counts': {
        requireAnyPermission(principal, ['inventory.read']);
        const where: Prisma.StockCountWhereInput = { workspaceId, ...(search ? { OR: [{ countNumber: { contains: search } }, { reason: { contains: search } }, { status: { contains: search } }, { countedBy: { name: { contains: search } } }, { location: { is: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } } }] } : {}) };
        return page(() => tx.stockCount.count({ where }), (skip, take) => tx.stockCount.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { location: true, lines: true, countedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } }), row => ({ ...row, locationCode: row.location?.code, locationName: row.location?.name, countedByName: row.countedBy.name, approvedByName: row.approvedBy?.name }));
      }
      case 'users': {
        requireAnyPermission(principal, ['access.manage']);
        const manageable = await tx.membership.findMany({ where: { userId: principal.userId, status: 'ACTIVE', roles: { some: { role: { isActive: true, permissions: { some: { permissionCode: 'access.manage' } } } } } }, select: { workspaceId: true } });
        const workspaceIds = new Set(manageable.map(m => m.workspaceId));
        const where: Prisma.MembershipWhereInput = { workspaceId, ...(search ? { OR: [{ user: { name: { contains: search } } }, { user: { email: { contains: search } } }, { status: { contains: search } }, { roles: { some: { role: { code: { contains: search } } } } }] } : {}) };
        return page(() => tx.membership.count({ where }), (skip, take) => tx.membership.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { user: { select: { id: true, name: true, email: true, updatedAt: true, memberships: { select: { workspaceId: true } } } }, roles: { include: { role: { select: { code: true } } } } } }), row => ({ id: row.id, userId: row.userId, name: row.user.name, email: row.user.email, identityUpdatedAt: row.user.updatedAt, canEditIdentity: row.user.memberships.every(m => workspaceIds.has(m.workspaceId)), status: row.status, customerId: row.customerId, technicianId: row.technicianId, version: row.version, roles: row.roles.map(r => r.role.code) }));
      }
      case 'roles': {
        requireAnyPermission(principal, ['access.manage']);
        const where: Prisma.RoleWhereInput = { workspaceId, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.role.count({ where }), (skip, take) => tx.role.findMany({ where, skip, take, orderBy: [{ code: 'asc' }, { id: 'asc' }], include: { permissions: true, _count: { select: { memberships: true } } } }), row => ({ ...row, memberCount: row._count.memberships, permissions: row.permissions.map(p => p.permissionCode).sort() }));
      }
      case 'permissions': {
        requireAnyPermission(principal, ['access.manage']);
        const where: Prisma.PermissionWhereInput = search ? { OR: [{ code: { contains: search } }, { description: { contains: search } }, { resource: { contains: search } }] } : {};
        return page(() => tx.permission.count({ where }), (skip, take) => tx.permission.findMany({ where, skip, take, orderBy: [{ resource: 'asc' }, { code: 'asc' }], select: { code: true, description: true, resource: true, action: true } }));
      }
      case 'my-work': {
        requireAnyPermission(principal, ['task.read_assigned', 'planning.read', 'task.assign', 'workspace.admin']);
        const supervisor = ['planning.read', 'task.assign', 'workspace.admin'].some(permission => principal.permissions.has(permission));
        const base: Prisma.TaskWhereInput = { workspaceId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...(!supervisor ? { assignedTechnicianId: principal.technicianId || '__unassigned_identity__' } : {}), ...(search ? { OR: [{ nodeKey: { contains: search } }, { instance: { order: { orderNumber: { contains: search } } } }, { instance: { order: { item: { name: { contains: search } } } } }, { instance: { order: { customer: { name: { contains: search } } } } }] } : {}) };
        const where: Prisma.TaskWhereInput = status ? { AND: [base, { status }] } : base;
        const groups = await tx.task.groupBy({ by: ['status'], where: base, _count: true });
        const result = await page(() => tx.task.count({ where }), (skip, take) => tx.task.findMany({ where, skip, take, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], include: { instance: { include: { workflowVersion: { include: { nodes: true } }, order: { include: { item: true, customer: true } } } }, predecessorDeps: { include: { predecessor: { select: { status: true } } } }, workSessions: { where: { endedAt: null }, orderBy: { startedAt: 'desc' }, take: 1 } } }), task => {
          const session = task.workSessions[0];
          const predecessorsComplete = task.predecessorDeps.every(dep => dep.predecessor.status === 'COMPLETED');
          return { id: task.id, nodeKey: task.nodeKey, nodeName: task.instance.workflowVersion.nodes.find(node => node.key === task.nodeKey)?.name || task.nodeKey, status: task.status, orderNumber: task.instance.order.orderNumber, customerName: task.instance.order.customer.name, itemName: task.instance.order.item.name, plannedDurationMinutes: task.plannedDurationMinutes, currentElapsedMinutes: task.actualDurationMinutes + (session?.sessionType === 'RUNNING' ? Math.max(0, Math.round((Date.now() - session.startedAt.getTime()) / 60000)) : 0), canStart: predecessorsComplete && ['READY', 'ASSIGNED', 'RUNNING', 'PAUSED'].includes(task.status), blockReason: !predecessorsComplete ? 'Waiting for predecessor tasks' : undefined };
        });
        return { ...result, summary: { statusCounts: Object.fromEntries(groups.map(group => [group.status, group._count])) } };
      }
      case 'planning': {
        const where: Prisma.TaskWhereInput = { workspaceId, id: { in: schedule!.scheduledTasks.map(task => task.taskId) }, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...(search ? { OR: [{ nodeKey: { contains: search } }, { instance: { order: { orderNumber: { contains: search } } } }, { instance: { order: { item: { name: { contains: search } } } } }, { instance: { order: { customer: { name: { contains: search } } } } }] } : {}) };
        const byId = new Map(schedule!.scheduledTasks.map(task => [task.taskId, task]));
        const result = await page(() => tx.task.count({ where }), (skip, take) => tx.task.findMany({ where, skip, take, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }), row => byId.get(row.id));
        return { ...result, summary: { makespanMinutes: schedule!.makespanMinutes, projectedEndAt: schedule!.projectedEndAt, criticalPathCount: schedule!.criticalPath.length, scheduledTaskCount: schedule!.scheduledTasks.length } };
      }
      case 'workflows': {
        requireAnyPermission(principal, ['workflow.read']);
        const where: Prisma.WorkflowTemplateWhereInput = { workspaceId, isArchived: false, ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.workflowTemplate.count({ where }), (skip, take) => tx.workflowTemplate.findMany({ where, skip, take, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], include: { orderType: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }));
      }
      case 'forms': {
        requireAnyPermission(principal, ['forms.read', 'owner']);
        const purpose = params.get('purpose');
        const where: Prisma.FormTemplateWhereInput = { workspaceId, ...(purpose && purpose !== 'ALL' ? { purpose } : {}), ...(search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {}) };
        return page(() => tx.formTemplate.count({ where }), (skip, take) => tx.formTemplate.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { versions: { select: { id: true, status: true, versionNumber: true, contentHash: true }, orderBy: { versionNumber: 'desc' } } } }), row => ({ ...row, versionsCount: row.versions.length, publishedVersion: row.versions.find(version => version.status === 'PUBLISHED') }));
      }
      case 'portal-orders': {
        requireAnyPermission(principal, ['customer_order.read_own']);
        if (!principal.customerId) throw new ForbiddenError('A customer account is required');
        const where: Prisma.OrderWhereInput = { workspaceId, customerId: principal.customerId, ...(search ? { OR: [
          { orderNumber: { contains: search } },
          { item: { name: { contains: search } } },
          { item: { code: { contains: search } } },
          { lines: { some: { item: { name: { contains: search } } } } },
          { lines: { some: { item: { code: { contains: search } } } } },
        ] } : {}) };
        const repository = new PortalRepository(tx);
        return page(() => tx.order.count({ where }), (skip, take) => repository.listCustomerOrders(workspaceId, principal.customerId!, { skip, take, search }));
      }
      default: throw new NotFoundError('Unknown paginated list');
    }
  });
}
