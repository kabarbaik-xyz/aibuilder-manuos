import { formatQuantity } from '@/domain/quantity';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { createHash } from 'crypto';
import { canonicalJson } from '@/server/db/transaction';
import { FormSubmissionService } from '@/server/modules/forms/submissions';

export interface AuthorizedContextScope {
  orderId?: string;
  itemId?: string;
  taskId?: string;
}

export interface AuthorizedContextOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  orderedQty: string;
  status: string;
  promisedDate: string | null;
}

export interface AuthorizedContextInventory {
  itemId: string;
  itemCode: string;
  itemName: string;
  onHandQty: string;
  reservedQty: string;
}

export interface AuthorizedContextResource {
  id: string;
  code: string;
  name: string;
  type: 'MACHINE' | 'TECHNICIAN';
  status: string;
}

export interface AuthorizedContextTask {
  id: string;
  nodeKey: string;
  status: string;
  plannedMinutes: number | null;
  actualMinutes: number | null;
  orderId: string;
  orderNumber: string;
}

export interface AuthorizedContextBooking {
  orderNumber: string;
  operation: string;
  resourceType: 'MACHINE' | 'TECHNICIAN';
  resourceName: string | null;
  startAt: string;
  endAt: string;
}

export interface AuthorizedContextFormEvidence {
  orderNumber: string;
  subject: string;
  purpose: string;
  finalizedAt: string;
  answers: Array<{ field: string; value: string }>;
}

export interface AuthorizedContextDisruption {
  materialId?: string;
  materialName?: string;
  delayDays?: number;
  newEtaDate?: string;
  affectedOrderNumbers: string[];
}

export interface AuthorizedContextLifecycleStage {
  orderId: string;
  orderNumber: string;
  workflowName: string;
  workflowVersion: number;
  name: string;
  action: string;
  state: string;
  department: string;
  assignedTo: string | null;
  dueAt: string | null;
  scheduleKind: string;
}

export interface AuthorizedContext {
  workspaceId: string;
  workspaceRevision: number;
  orders: AuthorizedContextOrder[];
  tasks: AuthorizedContextTask[];
  confirmedBookings: AuthorizedContextBooking[];
  submittedFormEvidence: AuthorizedContextFormEvidence[];
  inventory: AuthorizedContextInventory[];
  resources: AuthorizedContextResource[];
  lifecycleStages: AuthorizedContextLifecycleStage[];
  disruptions: AuthorizedContextDisruption[];
  evidenceIndex: string[]; // Serialized valid IDs, order numbers, part numbers, machine codes
  contextHash: string;
}

export interface AuthorizedEvidenceReference {
  recordType: 'ORDER' | 'ITEM' | 'TASK';
  recordId: string;
  label: string;
  href: string;
  reference: string;
}

export function resolveAuthorizedEvidenceReferences(
  context: AuthorizedContext,
  references: string[],
): AuthorizedEvidenceReference[] {
  const resolved: AuthorizedEvidenceReference[] = [];
  for (const reference of references) {
    const normalized = reference.trim().replace(/^#/, '').toLocaleLowerCase();
    if (!normalized) continue;
    const task = context.tasks.find(record => record.id.toLocaleLowerCase() === normalized);
    if (task) {
      resolved.push({ recordType: 'TASK', recordId: task.id, label: `${task.orderNumber} · ${task.nodeKey}`, href: `/planning/tasks/${encodeURIComponent(task.id)}`, reference });
      continue;
    }
    const order = context.orders.find(record => [record.id, record.orderNumber].some(value => value.toLocaleLowerCase() === normalized));
    if (order) {
      resolved.push({ recordType: 'ORDER', recordId: order.id, label: order.orderNumber, href: `/orders/${encodeURIComponent(order.id)}`, reference });
      continue;
    }
    const inventoryItem = context.inventory.find(record => [record.itemId, record.itemCode].some(value => value.toLocaleLowerCase() === normalized));
    const orderItem = context.orders.find(record => [record.itemId, record.itemCode].some(value => value.toLocaleLowerCase() === normalized));
    const item = inventoryItem
      ? { id: inventoryItem.itemId, code: inventoryItem.itemCode, name: inventoryItem.itemName }
      : orderItem ? { id: orderItem.itemId, code: orderItem.itemCode, name: orderItem.itemName } : null;
    if (item) resolved.push({ recordType: 'ITEM', recordId: item.id, label: `${item.code} · ${item.name}`, href: inventoryItem ? `/inventory/items/${encodeURIComponent(item.id)}` : `/orders/${encodeURIComponent(orderItem!.id)}`, reference });
  }
  return resolved;
}

/**
 * Builds a strictly-scoped, authorized snapshot of active operational facts.
 * Never includes passwords, session secrets, or unrelated customer records.
 */
export async function buildAuthorizedContext(
  principal: Principal,
  prisma: PrismaClient,
  scope?: AuthorizedContextScope
): Promise<AuthorizedContext> {
  const workspaceId = principal.workspaceId;

  // 1. Fetch workspace revision
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { revision: true },
  });
  const workspaceRevision = workspace?.revision ?? 1;
  const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
  const canReadAcrossFacilities = principal.roles.includes('OWNER');

  // 2. Fetch scoped orders (respect customer tenancy if customer user)
  const effectiveCustomerId = principal.customerId || undefined;
  const canReadOrders = principal.permissions.has('order.read') || principal.permissions.has('planning.read') || (Boolean(effectiveCustomerId) && principal.permissions.has('customer_order.read_own'));
  const dbOrders = canReadOrders ? await prisma.order.findMany({
    where: {
      workspaceId,
      ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
      ...(!effectiveCustomerId && !canReadAcrossFacilities ? { facilityId: { in: facilityIds } } : {}),
      ...(scope?.orderId ? { id: scope.orderId } : {}),
      ...(scope?.itemId ? { itemId: scope.itemId } : {}),
      ...(scope?.taskId ? { instances: { some: { tasks: { some: { id: scope.taskId } } } } } : {}),
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      customer: true,
      item: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  }) : [];

  const orders: AuthorizedContextOrder[] = dbOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    itemId: o.item.id,
    itemCode: o.item.code,
    itemName: o.item.name,
    orderedQty: formatQuantity(o.orderedAtoms),
    status: o.status,
    promisedDate: o.promisedDate ? o.promisedDate.toISOString().slice(0, 10) : null,
  }));

  const canReadAllTasks = principal.permissions.has('planning.read');
  const canReadAssignedTasks = principal.permissions.has('task.assign') && Boolean(principal.technicianId);
  const dbTasks = canReadAllTasks || canReadAssignedTasks ? await prisma.task.findMany({
    where: {
      workspaceId,
      ...(scope?.taskId ? { id: scope.taskId } : {}),
      ...(canReadAllTasks ? {} : { assignedTechnicianId: principal.technicianId! }),
      ...(!canReadAcrossFacilities ? { instance: { order: { facilityId: { in: facilityIds } } } } : {}),
      status: { not: 'CANCELLED' },
    },
    include: { instance: { include: { order: true } } },
    take: scope?.taskId ? 1 : 10,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  }) : [];
  const tasks: AuthorizedContextTask[] = dbTasks.map(task => ({
    id: task.id,
    nodeKey: task.nodeKey,
    status: task.status,
    plannedMinutes: task.plannedDurationMinutes > 0 ? task.plannedDurationMinutes : null,
    actualMinutes: task.actualDurationMinutes > 0 ? task.actualDurationMinutes : null,
    orderId: task.instance.order.id,
    orderNumber: task.instance.order.orderNumber,
  }));

  const submittedFormEvidence: AuthorizedContextFormEvidence[] = [];
  if (!effectiveCustomerId && principal.permissions.has('forms.read')) {
    const formSubmissions = new FormSubmissionService(prisma);
    const taskOrderById = new Map(dbTasks.map(task => [task.id, task.instance.order.orderNumber]));
    const orderById = new Map(dbOrders.map(order => [order.id, order.orderNumber]));
    const subjects = [
      ...dbOrders.map(order => ({ subjectType: 'ORDER' as const, subjectId: order.id, subjectLabel: order.orderNumber })),
      ...dbTasks.map(task => ({ subjectType: 'TASK' as const, subjectId: task.id, subjectLabel: `${taskOrderById.get(task.id)} / operation ${task.nodeKey}` })),
    ];
    for (const subject of subjects) {
      const instances = await formSubmissions.listInstancesForSubject(principal, subject.subjectType, subject.subjectId);
      for (const form of instances) {
        const submission = form.latestSubmission;
        if (submission?.status !== 'FINAL' || !submission.finalizedAt) continue;
        const answers = Object.entries(submission.answers).flatMap(([key, value]) => {
          const field = form.definition.fields.find(candidate => candidate.key === key);
          if (!field || field.kind === 'reference' || field.kind === 'attachment' || value === null) return [];
          const readableValue = Array.isArray(value) ? value.join(', ') : String(value);
          return [{ field: field.label, value: readableValue.slice(0, 500) }];
        }).slice(0, 12);
        if (answers.length === 0) continue;
        submittedFormEvidence.push({
          orderNumber: subject.subjectType === 'ORDER' ? (orderById.get(subject.subjectId) ?? subject.subjectLabel) : (taskOrderById.get(subject.subjectId) ?? subject.subjectLabel),
          subject: subject.subjectLabel,
          purpose: form.definition.purpose,
          finalizedAt: submission.finalizedAt,
          answers,
        });
        if (submittedFormEvidence.length >= 20) break;
      }
      if (submittedFormEvidence.length >= 20) break;
    }
  }

  const dbBookings = !effectiveCustomerId && principal.permissions.has('planning.read') && orders.length > 0
    ? await prisma.resourceBooking.findMany({
        where: {
          workspaceId,
          status: 'CONFIRMED',
          task: { instance: { orderId: { in: orders.map(order => order.id) } } },
        },
        include: { task: { include: { instance: { include: { order: { select: { id: true, orderNumber: true } } } } } } },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 30,
      })
    : [];

  // Lifecycle ownership is internal operational data; never expose it in customer context.
  const dbLifecycleStages = !effectiveCustomerId && canReadOrders && orders.length > 0
    ? await prisma.orderLifecycleStage.findMany({
        where: { workspaceId, instance: { orderId: { in: orders.map(order => order.id) }, status: 'ACTIVE' } },
        include: {
          department: { select: { name: true } },
          assignedMembership: { select: { user: { select: { name: true } } } },
          instance: { include: {
            order: { select: { id: true, orderNumber: true } },
            workflowVersion: { select: { versionNumber: true, template: { select: { name: true } } } },
          } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: 60,
      })
    : [];
  const lifecycleStages: AuthorizedContextLifecycleStage[] = dbLifecycleStages.map(stage => ({
    orderId: stage.instance.order.id,
    orderNumber: stage.instance.order.orderNumber,
    workflowName: stage.instance.workflowVersion.template.name,
    workflowVersion: stage.instance.workflowVersion.versionNumber,
    name: stage.name,
    action: stage.action,
    state: stage.state,
    department: stage.department.name,
    assignedTo: stage.assignedMembership?.user.name ?? null,
    dueAt: stage.dueAt?.toISOString() ?? null,
    scheduleKind: JSON.parse(stage.scheduleJson).kind,
  }));

  // 3. Fetch inventory balances
  const balances = !effectiveCustomerId && principal.permissions.has('inventory.read') ? await prisma.stockBalance.findMany({
    where: {
      workspaceId,
      ...(scope?.itemId ? { itemId: scope.itemId } : {}),
    },
    include: {
      item: true,
    },
    take: 30,
  }) : [];

  const itemBalanceMap = new Map<string, { item: any; onHand: bigint; reserved: bigint }>();
  for (const b of balances) {
    const existing = itemBalanceMap.get(b.itemId) || {
      item: b.item,
      onHand: 0n,
      reserved: 0n,
    };
    existing.onHand += b.onHandAtoms;
    existing.reserved += b.reservedAtoms;
    itemBalanceMap.set(b.itemId, existing);
  }

  const inventory: AuthorizedContextInventory[] = Array.from(itemBalanceMap.entries()).map(
    ([itemId, data]) => ({
      itemId,
      itemCode: data.item.code,
      itemName: data.item.name,
      onHandQty: formatQuantity(data.onHand),
      reservedQty: formatQuantity(data.reserved),
    })
  );

  // 4. Fetch resources (machines & technicians)
  const canReadResources = !effectiveCustomerId && (principal.permissions.has('planning.read') || principal.permissions.has('resource.manage'));
  const machines = canReadResources ? await prisma.machine.findMany({
    where: { workspaceId, archivedAt: null, ...(!canReadAcrossFacilities ? { OR: [{ facilityId: null }, { facilityId: { in: facilityIds } }] } : {}) },
    take: 10,
  }) : [];

  const technicians = canReadResources ? await prisma.technician.findMany({
    where: { workspaceId, archivedAt: null, ...(scope?.itemId ? { id: scope.itemId } : {}), ...(!canReadAcrossFacilities ? { OR: [{ facilityId: null }, { facilityId: { in: facilityIds } }] } : {}) },
    take: 10,
  }) : [];

  const machineNames = new Map(machines.map(machine => [machine.id, machine.name]));
  const technicianNames = new Map(technicians.map(technician => [technician.id, technician.name]));
  const confirmedBookings: AuthorizedContextBooking[] = dbBookings.map(booking => ({
    orderNumber: booking.task.instance.order.orderNumber,
    operation: booking.task.nodeKey,
    resourceType: booking.resourceType === 'TECHNICIAN' ? 'TECHNICIAN' : 'MACHINE',
    resourceName: booking.resourceType === 'TECHNICIAN'
      ? technicianNames.get(booking.resourceId) ?? null
      : machineNames.get(booking.resourceId) ?? null,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
  }));

  const resources: AuthorizedContextResource[] = [
    ...machines.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      type: 'MACHINE' as const,
      status: m.status,
    })),
    ...technicians.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      type: 'TECHNICIAN' as const,
      status: t.isActive ? 'AVAILABLE' : 'OFFLINE',
    })),
  ];

  // 5. Build evidence lookup list
  const evidenceSet = new Set<string>();

  // Include active items in workspace
  const catalogItems = !effectiveCustomerId && (principal.permissions.has('inventory.read') || principal.permissions.has('item.manage') || principal.permissions.has('planning.read')) ? await prisma.item.findMany({
    where: { workspaceId, archivedAt: null },
    take: 50,
  }) : [];
  for (const it of catalogItems) {
    evidenceSet.add(it.id);
    evidenceSet.add(it.code);
    evidenceSet.add(it.name);
  }

  for (const o of orders) {
    evidenceSet.add(o.id);
    evidenceSet.add(o.orderNumber);
    evidenceSet.add(o.itemCode);
    evidenceSet.add(o.customerName);
  }
  for (const task of tasks) {
    evidenceSet.add(task.id);
    evidenceSet.add(task.orderNumber);
  }
  for (const inv of inventory) {
    evidenceSet.add(inv.itemId);
    evidenceSet.add(inv.itemCode);
  }
  for (const res of resources) {
    evidenceSet.add(res.id);
    evidenceSet.add(res.code);
    evidenceSet.add(res.name);
  }

  const disruptions: AuthorizedContextDisruption[] = [];

  // Deterministic context hash
  const contextPayload = {
    workspaceId,
    workspaceRevision,
    effectiveCustomerId,
    permissions: [...principal.permissions].sort(),
    scope,
    orders,
    tasks,
    confirmedBookings,
    submittedFormEvidence,
    inventory,
    resources,
    lifecycleStages,
    evidenceIndex: [...evidenceSet].sort(),
  };

  const contextHash = createHash('sha256')
    .update(canonicalJson(contextPayload))
    .digest('hex');

  return {
    workspaceId,
    workspaceRevision,
    orders,
    tasks,
    confirmedBookings,
    submittedFormEvidence,
    inventory,
    resources,
    lifecycleStages,
    disruptions,
    evidenceIndex: Array.from(evidenceSet),
    contextHash,
  };
}
