import type { PrismaClient } from '@prisma/client';
import type { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { formatQuantity } from '@/domain/quantity';
export async function movementOptions(db: PrismaClient, principal: Principal, mode: 'issue' | 'return' | 'transfer', itemId?: string, locationId?: string) {
 requirePermission(principal, mode === 'transfer' ? 'inventory.transfer' : 'inventory.issue');
 requirePermission(principal, 'inventory.read');
 const demands = mode === 'transfer' ? [] : await db.materialDemand.findMany({ where: { workspaceId: principal.workspaceId, status: { not: 'CLOSED' }, order: { facilityId: { in: principal.facilityIds ?? [] }, status: { notIn: ['DRAFT','CANCELLED','DELIVERED'] } } }, include: { order: { select: { orderNumber: true } }, item: { include: { baseUom: true } }, task: { select: { nodeKey: true } } }, orderBy: { createdAt: 'desc' }, take: 501 });
 const balances = itemId && locationId ? await db.stockBalance.findMany({ where: { workspaceId: principal.workspaceId, itemId, locationId, onHandAtoms: { gt: 0 } }, include: { lot: true, item: { include: { baseUom: true } } }, orderBy: { createdAt: 'asc' }, take: 201 }) : [];
 return { demands: demands.slice(0,500).map(d => ({ id: d.id, itemId: d.itemId, precision: d.item.baseUom.precision, unit: d.item.baseUom.code, tracking: d.item.tracking, label: `${d.order.orderNumber} · ${d.item.name}${d.task ? ` · ${d.task.nodeKey}` : ''}`, required: formatQuantity(d.requiredAtoms) })), balances: balances.slice(0,200).map(b => ({ lotId: b.lotId, lotNumber: b.lot?.lotNumber ?? 'Unassigned stock', onHand: formatQuantity(b.onHandAtoms), onHandAtoms: b.onHandAtoms.toString(), reservedAtoms: b.reservedAtoms.toString() })), truncated: demands.length > 500 || balances.length > 200 };
}
