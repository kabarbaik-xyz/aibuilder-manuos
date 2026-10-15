import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { NotFoundError, BadRequestError, ConflictError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import {
  ReserveStockInput,
  ReserveStockSchema,
  ReleaseReservationInput,
  ReleaseReservationSchema,
  StockReservationDTO,
  getBucketKey,
} from './contracts';

export class ReservationService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Hard-reserves eligible on-hand stock for an approved order material demand.
   * Total reserved cannot exceed on-hand. Unmet demand remains a shortage.
   */
  async reserveStock(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'planning.write');
    const input: ReserveStockInput = ReserveStockSchema.parse(rawInput);
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
      throw new BadRequestError(`Cannot reserve for CLOSED material demand '${demand.id}'`);
    }

    // 2. Verify Location (cannot be Quarantine, Scrap, Customer, or WIP)
    const location = await this.db.location.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.locationId,
        },
      },
    });

    if (!location || !location.isActive) {
      throw new NotFoundError(`Location '${input.locationId}' not found or inactive`);
    }

    if (location.kind === 'QUARANTINE' || location.kind === 'SCRAP' || location.kind === 'CUSTOMER') {
      throw new BadRequestError(
        `Cannot reserve stock from ${location.kind} location '${location.code}'. Stock must be in eligible storage.`
      );
    }

    // 3. Verify Lot if Item is Lot-tracked
    if (demand.item.tracking === 'LOT') {
      if (!input.lotId) {
        throw new BadRequestError(`Item '${demand.item.code}' is LOT tracked; lotId is required for reservation`);
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
      commandType: 'inventory.reserve_stock',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const bucketKey = getBucketKey(demand.itemId, input.locationId, input.lotId);

        // Fetch current stock balance
        const balance = await tx.stockBalance.findUnique({
          where: {
            workspaceId_bucketKey: {
              workspaceId,
              bucketKey,
            },
          },
        });

        if (!balance) {
          throw new BadRequestError(
            `No stock balance found for item '${demand.item.code}' in location '${location.code}'. Available: 0 atoms.`
          );
        }

        const availableAtoms = balance.onHandAtoms - balance.reservedAtoms;
        if (availableAtoms < input.atoms) {
          throw new BadRequestError(
            `Insufficient available stock for '${demand.item.code}' in location '${location.code}'. Available: ${availableAtoms} atoms, Requested: ${input.atoms} atoms`
          );
        }

        // Conditional version-guarded balance update
        const updateResult = await tx.stockBalance.updateMany({
          where: {
            id: balance.id,
            version: balance.version,
          },
          data: {
            reservedAtoms: { increment: input.atoms },
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictError(
            `Concurrent stock reservation conflict on bucket '${bucketKey}'. Please retry.`
          );
        }

        // Create reservation
        const reservation = await tx.stockReservation.create({
          data: {
            workspaceId,
            demandId: demand.id,
            orderId: demand.orderId,
            taskId: demand.taskId,
            itemId: demand.itemId,
            locationId: input.locationId,
            lotId: input.lotId ?? null,
            reservedAtoms: input.atoms,
            status: 'ACTIVE',
            version: 1,
          },
          include: {
            item: true,
            location: true,
            lot: true,
          },
        });

        // Check if total active reservations now satisfy the required atoms
        const allActiveRes = await tx.stockReservation.findMany({
          where: {
            workspaceId,
            demandId: demand.id,
            status: 'ACTIVE',
          },
        });

        const totalReserved = allActiveRes.reduce(
          (acc: bigint, r: { reservedAtoms: bigint }) => acc + r.reservedAtoms,
          0n
        );
        if (totalReserved >= demand.requiredAtoms && demand.status === 'OPEN') {
          await tx.materialDemand.update({
            where: { id: demand.id },
            data: { status: 'ALLOCATED', version: { increment: 1 } },
          });
        }

        const dto: StockReservationDTO = {
          id: reservation.id,
          workspaceId: reservation.workspaceId,
          demandId: reservation.demandId,
          orderId: reservation.orderId,
          taskId: reservation.taskId,
          itemId: reservation.itemId,
          itemCode: reservation.item.code,
          itemName: reservation.item.name,
          locationId: reservation.locationId,
          locationCode: reservation.location.code,
          locationName: reservation.location.name,
          lotId: reservation.lotId,
          lotNumber: reservation.lot?.lotNumber ?? null,
          reservedAtoms: reservation.reservedAtoms,
          status: reservation.status,
          version: reservation.version,
          createdAt: reservation.createdAt.toISOString(),
          updatedAt: reservation.updatedAt.toISOString(),
        };

        return {
          data: dto,
          aggregateType: 'STOCK_RESERVATION',
          aggregateId: reservation.id,
          resourceVersion: reservation.version,
        };
      },
    });
  }

  /**
   * Releases an active hard reservation, restoring available on-hand balance.
   */
  async releaseReservation(
    principal: Principal,
    reservationId: string,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'planning.write');
    const workspaceId = principal.workspaceId;

    const reservation = await this.db.stockReservation.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: reservationId,
        },
      },
      include: {
        item: true,
        location: true,
        lot: true,
      },
    });

    if (!reservation) {
      throw new NotFoundError(`Stock reservation '${reservationId}' not found`);
    }

    if (reservation.status !== 'ACTIVE') {
      throw new BadRequestError(
        `Cannot release reservation in '${reservation.status}' status. Only ACTIVE reservations can be released.`
      );
    }

    return executeCommand({
      principal,
      commandType: 'inventory.release_reservation',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { reservationId },
      prismaClient: this.db,
      handler: async (tx) => {
        const bucketKey = getBucketKey(reservation.itemId, reservation.locationId, reservation.lotId);

        const balance = await tx.stockBalance.findUnique({
          where: {
            workspaceId_bucketKey: {
              workspaceId,
              bucketKey,
            },
          },
        });

        if (balance) {
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: {
              reservedAtoms: { decrement: reservation.reservedAtoms },
              version: { increment: 1 },
            },
          });
        }

        const updated = await tx.stockReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'RELEASED',
            version: { increment: 1 },
          },
          include: {
            item: true,
            location: true,
            lot: true,
          },
        });

        // If demand was ALLOCATED, revert to OPEN if total remaining active < required
        if (reservation.demandId) {
          const remainingActive = await tx.stockReservation.findMany({
            where: {
              workspaceId,
              demandId: reservation.demandId,
              status: 'ACTIVE',
            },
          });
          const totalActive = remainingActive.reduce(
            (acc: bigint, r: { reservedAtoms: bigint }) => acc + r.reservedAtoms,
            0n
          );

          const demand = await tx.materialDemand.findUnique({
            where: { id: reservation.demandId },
          });

          if (demand && totalActive < demand.requiredAtoms && demand.status === 'ALLOCATED') {
            await tx.materialDemand.update({
              where: { id: demand.id },
              data: { status: 'OPEN', version: { increment: 1 } },
            });
          }
        }

        const dto: StockReservationDTO = {
          id: updated.id,
          workspaceId: updated.workspaceId,
          demandId: updated.demandId,
          orderId: updated.orderId,
          taskId: updated.taskId,
          itemId: updated.itemId,
          itemCode: updated.item.code,
          itemName: updated.item.name,
          locationId: updated.locationId,
          locationCode: updated.location.code,
          locationName: updated.location.name,
          lotId: updated.lotId,
          lotNumber: updated.lot?.lotNumber ?? null,
          reservedAtoms: updated.reservedAtoms,
          status: updated.status,
          version: updated.version,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };

        return {
          data: dto,
          aggregateType: 'STOCK_RESERVATION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async listReservations(
    principal: Principal,
    filters: { demandId?: string; orderId?: string; taskId?: string; status?: string }
  ): Promise<StockReservationDTO[]> {
    requirePermission(principal, 'inventory.read');
    const workspaceId = principal.workspaceId;

    const rows = await this.db.stockReservation.findMany({
      where: {
        workspaceId,
        ...(filters.demandId ? { demandId: filters.demandId } : {}),
        ...(filters.orderId ? { orderId: filters.orderId } : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: {
        item: true,
        location: true,
        lot: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      demandId: r.demandId,
      orderId: r.orderId,
      taskId: r.taskId,
      itemId: r.itemId,
      itemCode: r.item.code,
      itemName: r.item.name,
      locationId: r.locationId,
      locationCode: r.location.code,
      locationName: r.location.name,
      lotId: r.lotId,
      lotNumber: r.lot?.lotNumber ?? null,
      reservedAtoms: r.reservedAtoms,
      status: r.status,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
