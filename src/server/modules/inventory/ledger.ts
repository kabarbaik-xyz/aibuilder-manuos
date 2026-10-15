import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import {
  PostMovementInput,
  getBucketKey,
  StockReconciliationResult,
} from './contracts';

export async function postMovement(
  tx: Prisma.TransactionClient,
  principal: Principal,
  input: PostMovementInput,
  commandId?: string
) {
  const workspaceId = principal.workspaceId;

  // 1. Validate Item
  const item = await tx.item.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: input.itemId,
      },
    },
  });

  if (!item || !item.isActive) {
    throw new NotFoundError(`Item '${input.itemId}' not found or inactive in this workspace`);
  }

  // 2. Validate Source Location if present
  let sourceLoc = null;
  if (input.sourceLocationId) {
    sourceLoc = await tx.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.sourceLocationId,
        },
      },
    });
    if (!sourceLoc || !sourceLoc.isActive) {
      throw new NotFoundError(
        `Source location '${input.sourceLocationId}' not found or inactive in this workspace`
      );
    }
  }

  // 3. Validate Destination Location if present
  let destLoc = null;
  if (input.destinationLocationId) {
    destLoc = await tx.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.destinationLocationId,
        },
      },
    });
    if (!destLoc || !destLoc.isActive) {
      throw new NotFoundError(
        `Destination location '${input.destinationLocationId}' not found or inactive in this workspace`
      );
    }
  }

  // 4. Validate Lots if item tracking is LOT
  if (item.tracking === 'LOT') {
    if (input.sourceLocationId && !input.sourceLotId) {
      throw new BadRequestError(`Item '${item.code}' is LOT tracked; sourceLotId is required`);
    }
    if (input.destinationLocationId && !input.destinationLotId) {
      // If destination is internal holding (RAW, WIP, FG, QUARANTINE), lot is required
      const internalKinds = ['RAW', 'WIP', 'FG', 'QUARANTINE'];
      if (destLoc && internalKinds.includes(destLoc.kind)) {
        throw new BadRequestError(
          `Item '${item.code}' is LOT tracked; destinationLotId is required for internal locations`
        );
      }
    }
  }

  // Verify source lot exists and belongs to workspace & item
  if (input.sourceLotId) {
    const lot = await tx.lot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.sourceLotId,
        },
      },
    });
    if (!lot || lot.itemId !== item.id) {
      throw new NotFoundError(
        `Source lot '${input.sourceLotId}' not found for item '${item.code}' in this workspace`
      );
    }
  }

  // Verify destination lot exists and belongs to workspace & item
  if (input.destinationLotId) {
    const lot = await tx.lot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.destinationLotId,
        },
      },
    });
    if (!lot || lot.itemId !== item.id) {
      throw new NotFoundError(
        `Destination lot '${input.destinationLotId}' not found for item '${item.code}' in this workspace`
      );
    }
  }

  // 5. Decrement Source Bucket if source location is present
  if (input.sourceLocationId) {
    const sourceBucketKey = getBucketKey(item.id, input.sourceLocationId, input.sourceLotId);

    const sourceBalance = await tx.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey: sourceBucketKey,
        },
      },
    });

    if (!sourceBalance || sourceBalance.onHandAtoms < input.atoms) {
      const currentOnHand = sourceBalance?.onHandAtoms ?? 0n;
      throw new BadRequestError(
        `Insufficient stock in source bucket for '${item.code}'. Required: ${input.atoms} atoms, Available on-hand: ${currentOnHand} atoms`
      );
    }

    const updatedSource = await tx.stockBalance.update({
      where: {
        id: sourceBalance.id,
        version: sourceBalance.version,
      },
      data: {
        onHandAtoms: {
          decrement: input.atoms,
        },
        version: {
          increment: 1,
        },
      },
    });

    if (updatedSource.onHandAtoms < 0n) {
      throw new BadRequestError(`Stock balance cannot become negative`);
    }
  }

  // 6. Increment Destination Bucket if destination location is present
  if (input.destinationLocationId) {
    const destBucketKey = getBucketKey(item.id, input.destinationLocationId, input.destinationLotId);

    const existingDest = await tx.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey: destBucketKey,
        },
      },
    });

    if (existingDest) {
      await tx.stockBalance.update({
        where: {
          id: existingDest.id,
          version: existingDest.version,
        },
        data: {
          onHandAtoms: {
            increment: input.atoms,
          },
          version: {
            increment: 1,
          },
        },
      });
    } else {
      await tx.stockBalance.create({
        data: {
          workspaceId,
          itemId: item.id,
          locationId: input.destinationLocationId,
          lotId: input.destinationLotId ?? null,
          bucketKey: destBucketKey,
          onHandAtoms: input.atoms,
          reservedAtoms: 0n,
          version: 1,
        },
      });
    }
  }

  // 7. Insert Immutable Movement Record
  const movement = await tx.stockMovement.create({
    data: {
      workspaceId,
      movementType: input.movementType,
      itemId: item.id,
      sourceLocationId: input.sourceLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      sourceLotId: input.sourceLotId ?? null,
      destinationLotId: input.destinationLotId ?? null,
      atoms: input.atoms,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorUserId: principal.userId,
      commandId: commandId ?? null,
      notes: input.notes ?? null,
    },
    include: {
      item: true,
      sourceLocation: true,
      destinationLocation: true,
      sourceLot: true,
      destinationLot: true,
    },
  });

  return movement;
}

export async function reconcileStock(
  db: PrismaClient | Prisma.TransactionClient,
  workspaceId: string
): Promise<StockReconciliationResult> {
  const movements = await db.stockMovement.findMany({
    where: { workspaceId },
  });

  // Calculate sum of movements per bucketKey
  const calculatedTotals = new Map<
    string,
    {
      itemId: string;
      locationId: string;
      lotId: string | null;
      calculatedOnHand: bigint;
    }
  >();

  for (const m of movements) {
    if (m.destinationLocationId) {
      const destKey = getBucketKey(m.itemId, m.destinationLocationId, m.destinationLotId);
      const existing = calculatedTotals.get(destKey) || {
        itemId: m.itemId,
        locationId: m.destinationLocationId,
        lotId: m.destinationLotId,
        calculatedOnHand: 0n,
      };
      existing.calculatedOnHand += m.atoms;
      calculatedTotals.set(destKey, existing);
    }

    if (m.sourceLocationId) {
      const srcKey = getBucketKey(m.itemId, m.sourceLocationId, m.sourceLotId);
      const existing = calculatedTotals.get(srcKey) || {
        itemId: m.itemId,
        locationId: m.sourceLocationId,
        lotId: m.sourceLotId,
        calculatedOnHand: 0n,
      };
      existing.calculatedOnHand -= m.atoms;
      calculatedTotals.set(srcKey, existing);
    }
  }

  // Compare with projected stock_balances
  const projectedBalances = await db.stockBalance.findMany({
    where: { workspaceId },
  });

  const projectedMap = new Map<string, bigint>();
  for (const b of projectedBalances) {
    projectedMap.set(b.bucketKey, b.onHandAtoms);
  }

  const allKeys = new Set([...calculatedTotals.keys(), ...projectedMap.keys()]);
  const mismatches: StockReconciliationResult['mismatches'] = [];

  for (const bucketKey of allKeys) {
    const projected = projectedMap.get(bucketKey) ?? 0n;
    const calcEntry = calculatedTotals.get(bucketKey);
    const calculated = calcEntry?.calculatedOnHand ?? 0n;

    if (projected !== calculated) {
      const [itemId, locationId, lotKey] = bucketKey.split(':');
      const lotId = lotKey === '__NO_LOT__' ? null : lotKey;
      mismatches.push({
        bucketKey,
        itemId: calcEntry?.itemId ?? itemId,
        locationId: calcEntry?.locationId ?? locationId,
        lotId: calcEntry?.lotId ?? lotId,
        projectedOnHand: projected,
        calculatedOnHand: calculated,
        delta: projected - calculated,
      });
    }
  }

  return {
    workspaceId,
    balanced: mismatches.length === 0,
    totalMovements: movements.length,
    totalBuckets: projectedBalances.length,
    mismatches,
  };
}
