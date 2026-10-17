import { formatQuantity } from '@/domain/quantity';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { createHash } from 'crypto';
import { canonicalJson } from '@/server/db/transaction';

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

export interface AuthorizedContextDisruption {
  materialId?: string;
  materialName?: string;
  delayDays?: number;
  newEtaDate?: string;
  affectedOrderNumbers: string[];
}

export interface AuthorizedContext {
  workspaceId: string;
  workspaceRevision: number;
  orders: AuthorizedContextOrder[];
  tasks: AuthorizedContextTask[];
  inventory: AuthorizedContextInventory[];
  resources: AuthorizedContextResource[];
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

  // 2. Fetch scoped orders (respect customer tenancy if customer user)
  const effectiveCustomerId = principal.customerId || undefined;
  const canReadOrders = principal.permissions.has('order.read') || principal.permissions.has('planning.read') || (Boolean(effectiveCustomerId) && principal.permissions.has('customer_order.read_own'));
  const dbOrders = canReadOrders ? await prisma.order.findMany({
    where: {
      workspaceId,
      ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
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
    where: { workspaceId, archivedAt: null },
    take: 10,
  }) : [];

  const technicians = canReadResources ? await prisma.technician.findMany({
    where: { workspaceId, archivedAt: null, ...(scope?.itemId ? { id: scope.itemId } : {}) },
    take: 10,
  }) : [];

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
    inventory,
    resources,
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
    inventory,
    resources,
    disruptions,
    evidenceIndex: Array.from(evidenceSet),
    contextHash,
  };
}
