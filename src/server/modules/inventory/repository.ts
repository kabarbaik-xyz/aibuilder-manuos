import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import {
  StockFilters,
  StockBalanceDTO,
  getBucketKey,
} from './contracts';

export class InventoryRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  async findItemById(workspaceId: string, itemId: string) {
    return this.db.item.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: itemId,
        },
      },
      include: {
        baseUom: true,
      },
    });
  }

  async findLocationById(workspaceId: string, locationId: string) {
    return this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: locationId,
        },
      },
    });
  }

  async findLotById(workspaceId: string, lotId: string) {
    return this.db.lot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: lotId,
        },
      },
    });
  }

  async findLotByNumber(workspaceId: string, itemId: string, lotNumber: string) {
    return this.db.lot.findUnique({
      where: {
        workspaceId_itemId_lotNumber: {
          workspaceId,
          itemId,
          lotNumber,
        },
      },
    });
  }

  async createLot(
    workspaceId: string,
    data: {
      itemId: string;
      lotNumber: string;
      supplierLotNumber?: string;
      expirationDate?: Date;
      notes?: string;
    }
  ) {
    return this.db.lot.create({
      data: {
        workspaceId,
        itemId: data.itemId,
        lotNumber: data.lotNumber,
        supplierLotNumber: data.supplierLotNumber,
        expirationDate: data.expirationDate,
        notes: data.notes,
      },
    });
  }

  async findBalanceByBucket(workspaceId: string, bucketKey: string) {
    return this.db.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey,
        },
      },
    });
  }

  async listBalances(principal: Principal, filters: StockFilters): Promise<StockBalanceDTO[]> {
    const where: Prisma.StockBalanceWhereInput = {
      workspaceId: principal.workspaceId,
    };

    if (filters.itemId) where.itemId = filters.itemId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.lotId) where.lotId = filters.lotId;
    if (!filters.includeZero) {
      where.OR = [
        { onHandAtoms: { gt: 0n } },
        { reservedAtoms: { gt: 0n } },
      ];
    }

    const rows = await this.db.stockBalance.findMany({
      where,
      include: {
        item: true,
        location: true,
        lot: true,
      },
      orderBy: [
        { item: { code: 'asc' } },
        { location: { code: 'asc' } },
      ],
    });

    return rows.map((r) => {
      const onHand = r.onHandAtoms;
      const reserved = r.reservedAtoms;
      const available = onHand > reserved ? onHand - reserved : 0n;

      return {
        id: r.id,
        workspaceId: r.workspaceId,
        itemId: r.itemId,
        itemCode: r.item.code,
        itemName: r.item.name,
        locationId: r.locationId,
        locationCode: r.location.code,
        locationName: r.location.name,
        locationKind: r.location.kind,
        lotId: r.lotId,
        lotNumber: r.lot?.lotNumber ?? null,
        bucketKey: r.bucketKey,
        onHandAtoms: onHand,
        reservedAtoms: reserved,
        availableAtoms: available,
        version: r.version,
      };
    });
  }

  async listMovements(
    principal: Principal,
    options: {
      itemId?: string;
      locationId?: string;
      limit?: number;
    } = {}
  ) {
    const where: Prisma.StockMovementWhereInput = {
      workspaceId: principal.workspaceId,
    };

    if (options.itemId) where.itemId = options.itemId;
    if (options.locationId) {
      where.OR = [
        { sourceLocationId: options.locationId },
        { destinationLocationId: options.locationId },
      ];
    }

    return this.db.stockMovement.findMany({
      where,
      include: {
        item: true,
        sourceLocation: true,
        destinationLocation: true,
        sourceLot: true,
        destinationLot: true,
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: options.limit ?? 100,
    });
  }
}
