import { Prisma, PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { hasPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from './ledger';
import {
  ConsumeIssuedMaterialInput,
  ConsumeIssuedMaterialSchema,
  TaskMaterialReadinessDTO,
  MovementType,
  MovementReferenceType,
} from './contracts';

export class ConsumptionService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Consumes issued material from shop-floor WIP during operation execution.
   * Removes on-hand atoms from WIP without creating another physical stock bucket.
   */
  async consumeIssuedMaterial(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    // Principal can be a technician executing assigned work, or warehouse/planner/owner
    const isAuthorized =
      hasPermission(principal, 'inventory.consume_assigned') ||
      hasPermission(principal, 'task.execute_assigned') ||
      hasPermission(principal, 'inventory.issue');

    if (!isAuthorized) {
      throw new ForbiddenError(
        "Permission denied: principal is missing required capability 'inventory.consume_assigned' or 'task.execute_assigned'"
      );
    }

    const input: ConsumeIssuedMaterialInput = ConsumeIssuedMaterialSchema.parse(rawInput);
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

    // 3. Verify Lot if Item is Lot-tracked
    if (demand.item.tracking === 'LOT') {
      if (!input.lotId) {
        throw new BadRequestError(`Item '${demand.item.code}' is LOT tracked; lotId is required for consumption`);
      }
      const lot = await this.db.lot.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.lotId,
          },
        },
      });
      if (!lot || lot.itemId !== demand.itemId) {
        throw new NotFoundError(`Lot '${input.lotId}' not found or does not belong to item '${demand.item.code}'`);
      }
    }

    return executeCommand({
      principal,
      commandType: 'inventory.consume_material',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        // Post movement: WIP -> null (consumed boundary)
        const movement = await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.PRODUCTION_CONSUME,
            itemId: demand.itemId,
            sourceLocationId: input.wipLocationId,
            destinationLocationId: null,
            sourceLotId: input.lotId ?? null,
            destinationLotId: null,
            atoms: input.atoms,
            referenceType: input.taskId ? MovementReferenceType.TASK : MovementReferenceType.ORDER,
            referenceId: input.taskId || demand.taskId || demand.orderId,
            notes: input.notes ?? `Consumed into production for Order ${demand.orderId}`,
          },
          requestId
        );

        // Calculate total consumed for this demand
        const allConsumeMoves = await tx.stockMovement.findMany({
          where: {
            workspaceId,
            movementType: MovementType.PRODUCTION_CONSUME,
            itemId: demand.itemId,
            referenceId: {
              in: [demand.orderId, demand.taskId || ''].filter(Boolean),
            },
          },
        });

        const totalConsumed = allConsumeMoves.reduce(
          (acc: bigint, m: { atoms: bigint }) => acc + m.atoms,
          0n
        );
        if (totalConsumed >= demand.requiredAtoms && demand.status !== 'CLOSED') {
          await tx.materialDemand.update({
            where: { id: demand.id },
            data: { status: 'CLOSED', version: { increment: 1 } },
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
   * Retrieves authoritative material readiness for a production routing task.
   * Compares required demand vs active reservations, issued WIP, and warehouse availability.
   */
  async getTaskMaterialReadiness(
    principal: Principal,
    taskId: string,
    dataClient: PrismaClient | Prisma.TransactionClient = this.db
  ): Promise<TaskMaterialReadinessDTO> {
    const workspaceId = principal.workspaceId;

    const task = await dataClient.task.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: taskId,
        },
      },
      include: {
        instance: {
          include: {
            order: {
              include: {
                demands: {
                  include: {
                    item: true,
                    reservations: {
                      where: { status: 'ACTIVE' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError(`Task '${taskId}' not found`);
    }

    const orderId = task.instance.orderId;
    const demands = task.instance.order.demands.filter(
      (d) => !d.taskId || d.taskId === taskId
    );

    const orderTaskIds = (await dataClient.task.findMany({
      where: { workspaceId, instance: { orderId } },
      select: { id: true },
    })).map((orderTask) => orderTask.id);

    // Fetch movements for this order/task
    const movements = await dataClient.stockMovement.findMany({
      where: {
        workspaceId,
        OR: [
          { referenceType: MovementReferenceType.ORDER, referenceId: orderId },
          { referenceType: MovementReferenceType.TASK, referenceId: { in: orderTaskIds } },
        ],
      },
    });

    // Fetch warehouse balances for each demand item in RAW locations
    const rawLocations = await dataClient.location.findMany({
      where: { workspaceId, kind: 'RAW', isActive: true },
      select: { id: true },
    });
    const rawLocIds = rawLocations.map((l) => l.id);

    const demandResults = await Promise.all(
      demands.map(async (d) => {
        // Reserved atoms
        const reservedAtoms = d.reservations.reduce((acc, r) => acc + r.reservedAtoms, 0n);

        // Issued to WIP
        const issuedMoves = movements.filter(
          (m) => m.itemId === d.itemId && m.movementType === MovementType.ISSUE_TO_WIP
        );
        const returnedMoves = movements.filter(
          (m) => m.itemId === d.itemId && m.movementType === MovementType.RETURN_FROM_WIP
        );
        const grossIssuedAtoms =
          issuedMoves.reduce((acc, m) => acc + m.atoms, 0n) -
          returnedMoves.reduce((acc, m) => acc + m.atoms, 0n);

        // Consumed in production
        const consumedMoves = movements.filter(
          (m) => m.itemId === d.itemId && m.movementType === MovementType.PRODUCTION_CONSUME
        );
        const consumedAtoms = consumedMoves.reduce((acc, m) => acc + m.atoms, 0n);
        const issuedAtoms = grossIssuedAtoms > consumedAtoms ? grossIssuedAtoms - consumedAtoms : 0n;

        // Available in warehouse raw storage
        const rawBalances = await dataClient.stockBalance.findMany({
          where: {
            workspaceId,
            itemId: d.itemId,
            locationId: { in: rawLocIds },
          },
        });
        const availableInWarehouseAtoms = rawBalances.reduce(
          (acc, b) => acc + (b.onHandAtoms - b.reservedAtoms),
          0n
        );

        return {
          demandId: d.id,
          itemId: d.itemId,
          itemCode: d.item.code,
          itemName: d.item.name,
          itemTracking: d.item.tracking,
          requiredAtoms: d.requiredAtoms,
          reservedAtoms,
          issuedAtoms,
          consumedAtoms,
          availableInWarehouseAtoms: availableInWarehouseAtoms > 0n ? availableInWarehouseAtoms : 0n,
          status: d.status,
        };
      })
    );

    const isFullyAllocated =
      demandResults.length > 0 &&
      demandResults.every((d) => d.reservedAtoms >= d.requiredAtoms || d.issuedAtoms >= d.requiredAtoms);
    const isFullyIssued =
      demandResults.length > 0 &&
      demandResults.every((d) => d.issuedAtoms >= d.requiredAtoms);
    const isFullyConsumed =
      demandResults.length > 0 &&
      demandResults.every((d) => d.consumedAtoms >= d.requiredAtoms);

    return {
      taskId: task.id,
      orderId,
      isFullyAllocated,
      isFullyIssued,
      isFullyConsumed,
      demands: demandResults,
    };
  }
}
