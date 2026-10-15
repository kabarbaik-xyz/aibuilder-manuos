import { Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/domain/errors';
import { hasPermission } from '@/server/auth/permissions';
import { nextNumberSequence } from '@/server/modules/common/sequence';
import { postMovement } from './ledger';
import {
  CreateStockCountInput,
  CreateStockCountSchema,
  StockCountDTO,
  getBucketKey,
} from './contracts';

export async function createStockCount(
  tx: Prisma.TransactionClient,
  principal: Principal,
  rawInput: CreateStockCountInput
): Promise<StockCountDTO> {
  if (!hasPermission(principal, 'inventory.count')) {
    throw new ForbiddenError('Missing inventory.count permission to record stock counts');
  }

  const input = CreateStockCountSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  // 1. Generate Count Number
  const countNumber = await nextNumberSequence(tx, principal.workspaceId, 'STOCK_COUNT', 'CNT');

  // 2. Fetch snapshots for all items/locations/lots specified
  const linesData: Array<{
    itemId: string;
    locationId: string;
    lotId?: string | null;
    snapshotAtoms: bigint;
    countedAtoms: bigint;
    discrepancyAtoms: bigint;
    notes?: string;
  }> = [];

  for (const line of input.lines) {
    const bucketKey = getBucketKey(line.itemId, line.locationId, line.lotId);
    const balance = await tx.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey,
        },
      },
    });

    const snapshotAtoms = balance?.onHandAtoms ?? 0n;
    const discrepancyAtoms = line.countedAtoms - snapshotAtoms;

    linesData.push({
      itemId: line.itemId,
      locationId: line.locationId,
      lotId: line.lotId ?? null,
      snapshotAtoms,
      countedAtoms: line.countedAtoms,
      discrepancyAtoms,
      notes: line.notes,
    });
  }

  // 3. Create Count and Lines
  const count = await tx.stockCount.create({
    data: {
      workspaceId,
      countNumber,
      status: 'SUBMITTED',
      locationId: input.locationId ?? null,
      reason: input.reason,
      notes: input.notes,
      countedById: principal.userId,
      version: 1,
      lines: {
        create: linesData.map((l) => ({
          itemId: l.itemId,
          locationId: l.locationId,
          lotId: l.lotId,
          snapshotAtoms: l.snapshotAtoms,
          countedAtoms: l.countedAtoms,
          discrepancyAtoms: l.discrepancyAtoms,
          notes: l.notes,
          version: 1,
        })),
      },
    },
    include: {
      countedBy: true,
      approvedBy: true,
      location: true,
      lines: {
        include: {
          item: true,
          location: true,
          lot: true,
        },
      },
    },
  });

  return mapStockCountToDTO(count);
}

export async function approveStockCount(
  tx: Prisma.TransactionClient,
  principal: Principal,
  countId: string
): Promise<StockCountDTO> {
  if (!hasPermission(principal, 'inventory.adjust_approve')) {
    throw new ForbiddenError(
      'Segregation of duties: only authorized approvers (inventory.adjust_approve) can approve stock discrepancies'
    );
  }

  const workspaceId = principal.workspaceId;

  const count = await tx.stockCount.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: countId,
      },
    },
    include: {
      lines: {
        include: {
          item: true,
          location: true,
          lot: true,
        },
      },
    },
  });

  if (!count) {
    throw new NotFoundError(`Stock count '${countId}' not found`);
  }

  if (count.status !== 'SUBMITTED') {
    throw new BadRequestError(`Cannot approve stock count in '${count.status}' state`);
  }

  // Check staleness and post adjustments
  for (const line of count.lines) {
    const bucketKey = getBucketKey(line.itemId, line.locationId, line.lotId);
    const currentBalance = await tx.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey,
        },
      },
    });

    const currentOnHand = currentBalance?.onHandAtoms ?? 0n;

    // Stale check
    if (currentOnHand !== line.snapshotAtoms) {
      throw new BadRequestError(
        `Stale count snapshot for item '${line.item.code}' in location '${line.location.code}': snapshot was ${line.snapshotAtoms} atoms but current balance is ${currentOnHand} atoms. A recount is required.`
      );
    }

    if (line.discrepancyAtoms !== 0n) {
      let movement;
      if (line.discrepancyAtoms > 0n) {
        // Inbound positive adjustment (surplus found)
        movement = await postMovement(tx, principal, {
          movementType: 'ADJUSTMENT',
          itemId: line.itemId,
          sourceLocationId: null,
          destinationLocationId: line.locationId,
          destinationLotId: line.lotId,
          atoms: line.discrepancyAtoms,
          referenceType: 'COUNT',
          referenceId: count.id,
          notes: `Stock count surplus adjustment (${count.countNumber})`,
        });
      } else {
        // Outbound negative adjustment (shrinkage / deficit write-off)
        movement = await postMovement(tx, principal, {
          movementType: 'ADJUSTMENT',
          itemId: line.itemId,
          sourceLocationId: line.locationId,
          sourceLotId: line.lotId,
          destinationLocationId: null,
          atoms: -line.discrepancyAtoms,
          referenceType: 'COUNT',
          referenceId: count.id,
          notes: `Stock count shortage adjustment (${count.countNumber})`,
        });
      }

      await tx.stockCountLine.update({
        where: { id: line.id },
        data: {
          movementId: movement.id,
          version: { increment: 1 },
        },
      });
    }
  }

  const updated = await tx.stockCount.update({
    where: { id: count.id },
    data: {
      status: 'APPROVED',
      approvedById: principal.userId,
      approvedAt: new Date(),
      version: { increment: 1 },
    },
    include: {
      countedBy: true,
      approvedBy: true,
      location: true,
      lines: {
        include: {
          item: true,
          location: true,
          lot: true,
        },
      },
    },
  });

  return mapStockCountToDTO(updated);
}

export async function listStockCounts(
  db: Prisma.TransactionClient,
  principal: Principal
): Promise<StockCountDTO[]> {
  if (!hasPermission(principal, 'inventory.read')) {
    throw new ForbiddenError('Missing inventory.read permission');
  }

  const counts = await db.stockCount.findMany({
    where: { workspaceId: principal.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      countedBy: true,
      approvedBy: true,
      location: true,
      lines: {
        include: {
          item: true,
          location: true,
          lot: true,
        },
      },
    },
  });

  return counts.map(mapStockCountToDTO);
}

export async function getStockCount(
  db: Prisma.TransactionClient,
  principal: Principal,
  countId: string
): Promise<StockCountDTO> {
  if (!hasPermission(principal, 'inventory.read')) {
    throw new ForbiddenError('Missing inventory.read permission');
  }

  const count = await db.stockCount.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: principal.workspaceId,
        id: countId,
      },
    },
    include: {
      countedBy: true,
      approvedBy: true,
      location: true,
      lines: {
        include: {
          item: true,
          location: true,
          lot: true,
        },
      },
    },
  });

  if (!count) {
    throw new NotFoundError(`Stock count '${countId}' not found`);
  }

  return mapStockCountToDTO(count);
}

function mapStockCountToDTO(count: any): StockCountDTO {
  return {
    id: count.id,
    workspaceId: count.workspaceId,
    countNumber: count.countNumber,
    status: count.status,
    locationId: count.locationId,
    locationCode: count.location?.code,
    locationName: count.location?.name,
    reason: count.reason,
    notes: count.notes,
    countedById: count.countedById,
    countedByName: count.countedBy?.name ?? 'Unknown',
    approvedById: count.approvedById,
    approvedByName: count.approvedBy?.name,
    approvedAt: count.approvedAt ? count.approvedAt.toISOString() : null,
    version: count.version,
    createdAt: count.createdAt.toISOString(),
    updatedAt: count.updatedAt.toISOString(),
    lines: (count.lines || []).map((l: any) => ({
      id: l.id,
      countId: l.countId,
      itemId: l.itemId,
      itemCode: l.item?.code ?? '',
      itemName: l.item?.name ?? '',
      locationId: l.locationId,
      locationCode: l.location?.code ?? '',
      locationName: l.location?.name ?? '',
      lotId: l.lotId,
      lotNumber: l.lot?.lotNumber ?? null,
      snapshotAtoms: l.snapshotAtoms,
      countedAtoms: l.countedAtoms,
      discrepancyAtoms: l.discrepancyAtoms,
      movementId: l.movementId,
      notes: l.notes,
      version: l.version,
    })),
  };
}
