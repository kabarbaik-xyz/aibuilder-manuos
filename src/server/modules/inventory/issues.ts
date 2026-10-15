import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { NotFoundError, BadRequestError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from './ledger';
import {
  IssueToProductionInput,
  IssueToProductionSchema,
  ReturnUnusedMaterialInput,
  ReturnUnusedMaterialSchema,
  MovementType,
  MovementReferenceType,
  getBucketKey,
} from './contracts';

export class IssueService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Issues raw material from warehouse storage into shop-floor WIP.
   * If a reservation is referenced, releases or marks it consumed.
   */
  async issueToProduction(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'inventory.issue');
    const input: IssueToProductionInput = IssueToProductionSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // 1. Verify Demand
    const demand = await this.db.materialDemand.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.demandId,
        },
      },
      include: {
        item: true,
      },
    });

    if (!demand) {
      throw new NotFoundError(`Material demand '${input.demandId}' not found`);
    }

    if (demand.status === 'CLOSED') {
      throw new BadRequestError(`Cannot issue to CLOSED demand '${demand.id}'`);
    }

    // 2. Verify Source Location (must be RAW or general storage, not WIP, QUARANTINE, SCRAP, CUSTOMER)
    const sourceLoc = await this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.sourceLocationId,
        },
      },
    });

    if (!sourceLoc || !sourceLoc.isActive) {
      throw new NotFoundError(`Source location '${input.sourceLocationId}' not found or inactive`);
    }

    if (sourceLoc.kind === 'QUARANTINE' || sourceLoc.kind === 'SCRAP' || sourceLoc.kind === 'WIP') {
      throw new BadRequestError(
        `Cannot issue from ${sourceLoc.kind} location '${sourceLoc.code}'. Source location must be raw/storage warehouse.`
      );
    }

    // 3. Verify Destination Location (MUST be WIP)
    const wipLoc = await this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.wipLocationId,
        },
      },
    });

    if (!wipLoc || !wipLoc.isActive) {
      throw new NotFoundError(`WIP location '${input.wipLocationId}' not found or inactive`);
    }

    if (wipLoc.kind !== 'WIP') {
      throw new BadRequestError(
        `Destination location '${wipLoc.code}' is kind '${wipLoc.kind}'. Issue to production requires a WIP destination location.`
      );
    }

    // 4. Verify Lot if item is LOT tracked
    if (demand.item.tracking === 'LOT') {
      if (!input.sourceLotId) {
        throw new BadRequestError(`Item '${demand.item.code}' is LOT tracked; sourceLotId is required for issue`);
      }
      const lot = await this.db.lot.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.sourceLotId,
          },
        },
      });
      if (!lot || lot.itemId !== demand.itemId) {
        throw new NotFoundError(`Lot '${input.sourceLotId}' not found or does not belong to item '${demand.item.code}'`);
      }
    }

    return executeCommand({
      principal,
      commandType: 'inventory.issue_to_wip',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        // If reservationId is provided or active reservation exists for this demand, consume/release it
        let res = null;
        if (input.reservationId) {
          res = await tx.stockReservation.findUnique({
            where: {
              workspaceId_id: {
                workspaceId,
                id: input.reservationId,
              },
            },
          });

          if (!res) {
            throw new NotFoundError(`Stock reservation '${input.reservationId}' not found`);
          }

          if (res.status !== 'ACTIVE') {
            throw new BadRequestError(`Reservation '${input.reservationId}' is not ACTIVE (status: ${res.status})`);
          }

          if (res.locationId !== input.sourceLocationId) {
            throw new BadRequestError(
              `Reservation location mismatch: reserved at '${res.locationId}' but issuing from '${input.sourceLocationId}'`
            );
          }

          if (input.atoms > res.reservedAtoms) {
            throw new BadRequestError(
              `Issue quantity (${input.atoms} atoms) exceeds reservation quantity (${res.reservedAtoms} atoms)`
            );
          }
        } else {
          res = await tx.stockReservation.findFirst({
            where: {
              workspaceId,
              demandId: demand.id,
              locationId: input.sourceLocationId,
              status: 'ACTIVE',
            },
          });
        }

        if (res && res.status === 'ACTIVE') {
          const atomsToConsume = input.atoms > res.reservedAtoms ? res.reservedAtoms : input.atoms;

          // Decrement reserved atoms in source bucket
          const sourceBucketKey = getBucketKey(demand.itemId, input.sourceLocationId, input.sourceLotId);
          const sourceBalance = await tx.stockBalance.findUnique({
            where: {
              workspaceId_bucketKey: {
                workspaceId,
                bucketKey: sourceBucketKey,
              },
            },
          });

          if (sourceBalance && sourceBalance.reservedAtoms > 0n) {
            const dec = atomsToConsume > sourceBalance.reservedAtoms ? sourceBalance.reservedAtoms : atomsToConsume;
            await tx.stockBalance.update({
              where: { id: sourceBalance.id },
              data: {
                reservedAtoms: { decrement: dec },
                version: { increment: 1 },
              },
            });
          }

          // Update reservation status / quantity
          if (atomsToConsume === res.reservedAtoms) {
            await tx.stockReservation.update({
              where: { id: res.id },
              data: { status: 'CONSUMED', version: { increment: 1 } },
            });
          } else {
            await tx.stockReservation.update({
              where: { id: res.id },
              data: {
                reservedAtoms: { decrement: atomsToConsume },
                version: { increment: 1 },
              },
            });
          }
        }

        // Post ledger movement from Raw -> WIP
        const movement = await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.ISSUE_TO_WIP,
            itemId: demand.itemId,
            sourceLocationId: input.sourceLocationId,
            destinationLocationId: input.wipLocationId,
            sourceLotId: input.sourceLotId ?? null,
            destinationLotId: input.sourceLotId ?? null, // Lot propagates into WIP
            atoms: input.atoms,
            referenceType: MovementReferenceType.ORDER,
            referenceId: demand.orderId,
            notes: input.notes ?? `Issued to WIP for Order ${demand.orderId}`,
          },
          requestId
        );

        // Update material demand status if satisfied
        const allIssueMoves = await tx.stockMovement.findMany({
          where: {
            workspaceId,
            movementType: MovementType.ISSUE_TO_WIP,
            itemId: demand.itemId,
            referenceId: demand.orderId,
          },
        });
        const totalIssued = allIssueMoves.reduce(
          (acc: bigint, m: { atoms: bigint }) => acc + m.atoms,
          0n
        );

        if (totalIssued >= demand.requiredAtoms && demand.status !== 'ISSUED') {
          await tx.materialDemand.update({
            where: { id: demand.id },
            data: { status: 'ISSUED', version: { increment: 1 } },
          });
        }

        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Returns unused material from shop-floor WIP back to warehouse storage.
   * Decrements WIP balance and restores raw balance without creating a supplier purchase receipt.
   */
  async returnUnusedMaterial(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'inventory.issue');
    const input: ReturnUnusedMaterialInput = ReturnUnusedMaterialSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // 1. Verify Demand
    const demand = await this.db.materialDemand.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.demandId,
        },
      },
      include: {
        item: true,
      },
    });

    if (!demand) {
      throw new NotFoundError(`Material demand '${input.demandId}' not found`);
    }

    // 2. Verify Source Location (MUST be WIP)
    const wipLoc = await this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.wipLocationId,
        },
      },
    });

    if (!wipLoc || !wipLoc.isActive || wipLoc.kind !== 'WIP') {
      throw new BadRequestError(
        `Source location '${input.wipLocationId}' must be an active WIP stage location.`
      );
    }

    // 3. Verify Destination Location (MUST be RAW / storage, not Quarantine, WIP, Scrap, or Customer)
    const destLoc = await this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.destinationLocationId,
        },
      },
    });

    if (!destLoc || !destLoc.isActive) {
      throw new NotFoundError(`Destination location '${input.destinationLocationId}' not found or inactive`);
    }

    if (destLoc.kind !== 'RAW') {
      throw new BadRequestError(
        `Destination location '${destLoc.code}' has kind '${destLoc.kind}'. Unused material returns must return to RAW storage.`
      );
    }

    return executeCommand({
      principal,
      commandType: 'inventory.return_from_wip',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        // Post movement from WIP -> Raw
        const movement = await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.RETURN_FROM_WIP,
            itemId: demand.itemId,
            sourceLocationId: input.wipLocationId,
            destinationLocationId: input.destinationLocationId,
            sourceLotId: input.lotId ?? null,
            destinationLotId: input.lotId ?? null,
            atoms: input.atoms,
            referenceType: MovementReferenceType.ORDER,
            referenceId: demand.orderId,
            notes: input.notes ?? `Returned unused material from WIP for Order ${demand.orderId}`,
          },
          requestId
        );

        // Re-evaluate demand status: if total net issued is now less than required, return to OPEN
        const allIssueMoves = await tx.stockMovement.findMany({
          where: {
            workspaceId,
            movementType: MovementType.ISSUE_TO_WIP,
            itemId: demand.itemId,
            referenceId: demand.orderId,
          },
        });
        const allReturnMoves = await tx.stockMovement.findMany({
          where: {
            workspaceId,
            movementType: MovementType.RETURN_FROM_WIP,
            itemId: demand.itemId,
            referenceId: demand.orderId,
          },
        });

        const totalIssued = allIssueMoves.reduce(
          (acc: bigint, m: { atoms: bigint }) => acc + m.atoms,
          0n
        );
        const totalReturned = allReturnMoves.reduce(
          (acc: bigint, m: { atoms: bigint }) => acc + m.atoms,
          0n
        );
        const netIssued = totalIssued - totalReturned;

        if (netIssued < demand.requiredAtoms && demand.status === 'ISSUED') {
          await tx.materialDemand.update({
            where: { id: demand.id },
            data: { status: 'OPEN', version: { increment: 1 } },
          });
        }

        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }
}
