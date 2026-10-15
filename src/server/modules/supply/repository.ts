import { PrismaClient, Prisma } from '@prisma/client';
import { SupplyOrderDTO, SupplyReceiptDTO } from './contracts';

export class SupplyRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  async nextSequence(
    workspaceId: string,
    kind: 'SUPPLY_ORDER' | 'SUPPLY_RECEIPT',
    prefix: string,
    txClient?: PrismaClient | Prisma.TransactionClient
  ): Promise<string> {
    const client = txClient ?? this.db;
    const year = new Date().getFullYear();
    const seq = await client.numberSequence.upsert({
      where: {
        workspaceId_kind_year: {
          workspaceId,
          kind,
          year,
        },
      },
      update: {
        nextValue: { increment: 1 },
      },
      create: {
        workspaceId,
        kind,
        year,
        nextValue: 2,
      },
    });

    const currentVal = seq.nextValue === 2 ? 1 : seq.nextValue - 1;
    return `${prefix}-${year}-${String(currentVal).padStart(4, '0')}`;
  }

  async findOrderById(workspaceId: string, orderId: string): Promise<SupplyOrderDTO | null> {
    const row = await this.db.supplyOrder.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: orderId,
        },
      },
      include: {
        supplier: true,
        lines: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      orderNumber: row.orderNumber,
      supplierId: row.supplierId,
      supplierCode: row.supplier.code,
      supplierName: row.supplier.name,
      status: row.status,
      expectedDate: row.expectedDate.toISOString(),
      notes: row.notes,
      version: row.version,
      approvedById: row.approvedById,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((l) => ({
        id: l.id,
        supplyOrderId: l.supplyOrderId,
        itemId: l.itemId,
        itemCode: l.item.code,
        itemName: l.item.name,
        tracking: l.item.tracking,
        orderedAtoms: l.orderedAtoms,
        receivedAtoms: l.receivedAtoms,
        openAtoms: l.orderedAtoms > l.receivedAtoms ? l.orderedAtoms - l.receivedAtoms : 0n,
        unitPriceCents: l.unitPriceCents,
        notes: l.notes,
        version: l.version,
      })),
    };
  }

  async listOrders(
    workspaceId: string,
    filters: { supplierId?: string; status?: string } = {}
  ): Promise<SupplyOrderDTO[]> {
    const where: Prisma.SupplyOrderWhereInput = { workspaceId };
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.status) where.status = filters.status;

    const rows = await this.db.supplyOrder.findMany({
      where,
      include: {
        supplier: true,
        lines: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      orderNumber: row.orderNumber,
      supplierId: row.supplierId,
      supplierCode: row.supplier.code,
      supplierName: row.supplier.name,
      status: row.status,
      expectedDate: row.expectedDate.toISOString(),
      notes: row.notes,
      version: row.version,
      approvedById: row.approvedById,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((l) => ({
        id: l.id,
        supplyOrderId: l.supplyOrderId,
        itemId: l.itemId,
        itemCode: l.item.code,
        itemName: l.item.name,
        tracking: l.item.tracking,
        orderedAtoms: l.orderedAtoms,
        receivedAtoms: l.receivedAtoms,
        openAtoms: l.orderedAtoms > l.receivedAtoms ? l.orderedAtoms - l.receivedAtoms : 0n,
        unitPriceCents: l.unitPriceCents,
        notes: l.notes,
        version: l.version,
      })),
    }));
  }

  async listReceipts(
    workspaceId: string,
    filters: { supplyOrderId?: string } = {}
  ): Promise<SupplyReceiptDTO[]> {
    const where: Prisma.SupplyReceiptWhereInput = { workspaceId };
    if (filters.supplyOrderId) where.supplyOrderId = filters.supplyOrderId;

    const rows = await this.db.supplyReceipt.findMany({
      where,
      include: {
        supplyOrder: true,
        supplier: true,
        receivedBy: true,
        lines: {
          include: {
            item: true,
            location: true,
            lot: true,
          },
        },
      },
      orderBy: {
        receivedDate: 'desc',
      },
    });

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      receiptNumber: r.receiptNumber,
      supplyOrderId: r.supplyOrderId,
      orderNumber: r.supplyOrder.orderNumber,
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      receivedDate: r.receivedDate.toISOString(),
      notes: r.notes,
      receivedById: r.receivedById,
      receivedByName: r.receivedBy.name,
      createdAt: r.createdAt.toISOString(),
      lines: r.lines.map((l) => ({
        id: l.id,
        receiptId: l.receiptId,
        supplyOrderLineId: l.supplyOrderLineId,
        itemId: l.itemId,
        itemCode: l.item.code,
        itemName: l.item.name,
        locationId: l.locationId,
        locationCode: l.location.code,
        lotId: l.lotId,
        lotNumber: l.lot?.lotNumber ?? null,
        receivedAtoms: l.receivedAtoms,
        movementId: l.movementId,
        notes: l.notes,
      })),
    }));
  }
}
