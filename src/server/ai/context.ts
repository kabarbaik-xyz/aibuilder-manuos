import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { createHash } from 'crypto';
import { canonicalJson } from '@/server/db/transaction';

export interface AuthorizedContextScope {
  orderId?: string;
  itemId?: string;
}

export interface AuthorizedContextOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  orderedQty: number;
  status: string;
  promisedDate: string | null;
}

export interface AuthorizedContextInventory {
  itemId: string;
  itemCode: string;
  itemName: string;
  onHandQty: number;
  reservedQty: number;
}

export interface AuthorizedContextResource {
  id: string;
  code: string;
  name: string;
  type: 'MACHINE' | 'TECHNICIAN';
  status: string;
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
  inventory: AuthorizedContextInventory[];
  resources: AuthorizedContextResource[];
  disruptions: AuthorizedContextDisruption[];
  evidenceIndex: string[]; // Serialized valid IDs, order numbers, part numbers, machine codes
  contextHash: string;
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
  const dbOrders = await prisma.order.findMany({
    where: {
      workspaceId,
      ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
      ...(scope?.orderId ? { id: scope.orderId } : {}),
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      customer: true,
      item: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  const orders: AuthorizedContextOrder[] = dbOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customer.name,
    itemCode: o.item.code,
    itemName: o.item.name,
    orderedQty: Number(o.orderedAtoms / 1_000_000n),
    status: o.status,
    promisedDate: o.promisedDate ? o.promisedDate.toISOString().slice(0, 10) : null,
  }));

  // 3. Fetch inventory balances
  const balances = await prisma.stockBalance.findMany({
    where: {
      workspaceId,
      ...(scope?.itemId ? { itemId: scope.itemId } : {}),
    },
    include: {
      item: true,
    },
    take: 30,
  });

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
      onHandQty: Number(data.onHand / 1_000_000n),
      reservedQty: Number(data.reserved / 1_000_000n),
    })
  );

  // 4. Fetch resources (machines & technicians)
  const machines = await prisma.machine.findMany({
    where: { workspaceId, archivedAt: null },
    take: 10,
  });

  const technicians = await prisma.technician.findMany({
    where: { workspaceId, archivedAt: null },
    take: 10,
  });

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
  const catalogItems = await prisma.item.findMany({
    where: { workspaceId, archivedAt: null },
    take: 50,
  });
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
    scope,
    orders: orders.map((o) => ({ id: o.id, num: o.orderNumber, status: o.status })),
    inventory: inventory.map((i) => ({ code: i.itemCode, onHand: i.onHandQty })),
    resources: resources.map((r) => ({ code: r.code, status: r.status })),
  };

  const contextHash = createHash('sha256')
    .update(canonicalJson(contextPayload))
    .digest('hex');

  return {
    workspaceId,
    workspaceRevision,
    orders,
    inventory,
    resources,
    disruptions,
    evidenceIndex: Array.from(evidenceSet),
    contextHash,
  };
}
