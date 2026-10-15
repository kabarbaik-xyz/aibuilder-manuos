import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from '../inventory/ledger';
import { MovementType, MovementReferenceType, getBucketKey } from '../inventory/contracts';
import {
  AllocateShipmentSchema,
  DispatchShipmentSchema,
  ConfirmDeliverySchema,
  ShipmentStatus,
} from './contracts';
import {
  findShipmentById,
  getNextShipmentNumber,
} from './repository';

export class DeliveryService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Allocates eligible finished goods stock to a shipment for an order.
   * Creates a hard reservation against the finished goods location and bucket.
   */
  async allocateShipment(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['delivery.dispatch', 'order.create', 'owner']);
    const input = AllocateShipmentSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // 1. Verify Order
    const order = await this.db.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
      include: {
        customer: true,
        item: true,
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found`);
    }

    if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
      throw new BadRequestError(`Cannot allocate shipment for order in status '${order.status}'`);
    }

    // 2. Verify all lines have eligible Finished Goods (FG) stock
    for (const line of input.lines) {
      const loc = await this.db.location.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: line.sourceLocationId,
          },
        },
      });

      if (!loc || !loc.isActive || loc.archivedAt) {
        throw new NotFoundError(`Location '${line.sourceLocationId}' not found or inactive`);
      }

      if (loc.kind !== 'FG') {
        throw new BadRequestError(
          `Shipment allocation must source from Finished Goods (FG) location, but got '${loc.kind}'`
        );
      }

      const bucketKey = getBucketKey(line.itemId, line.sourceLocationId, line.lotId);
      const balance = await this.db.stockBalance.findUnique({
        where: {
          workspaceId_bucketKey: {
            workspaceId,
            bucketKey,
          },
        },
      });

      const onHand = balance?.onHandAtoms ?? 0n;
      const reserved = balance?.reservedAtoms ?? 0n;
      const available = onHand > reserved ? onHand - reserved : 0n;

      if (available < line.allocatedAtoms) {
        throw new BadRequestError(
          `Insufficient available stock for item in location '${loc.name}'. Required: ${line.allocatedAtoms} atoms, Available: ${available} atoms.`
        );
      }
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'delivery.shipment.allocate',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const shipmentNumber = await getNextShipmentNumber(tx as any, workspaceId);

        const shipment = await tx.shipment.create({
          data: {
            workspaceId,
            shipmentNumber,
            orderId: order.id,
            customerId: order.customerId,
            status: ShipmentStatus.ALLOCATED,
            carrierName: input.carrierName,
            trackingNumber: input.trackingNumber,
            destinationAddress: input.destinationAddress || order.customer.address,
            notes: input.notes,
          },
        });

        // Create shipment lines and stock reservations
        for (const line of input.lines) {
          const reservation = await tx.stockReservation.create({
            data: {
              workspaceId,
              orderId: order.id,
              itemId: line.itemId,
              locationId: line.sourceLocationId,
              lotId: line.lotId,
              reservedAtoms: line.allocatedAtoms,
              status: 'ACTIVE',
            },
          });

          // Increment reserved atoms on stock balance
          const bucketKey = getBucketKey(line.itemId, line.sourceLocationId, line.lotId);
          await tx.stockBalance.update({
            where: {
              workspaceId_bucketKey: {
                workspaceId,
                bucketKey,
              },
            },
            data: {
              reservedAtoms: {
                increment: line.allocatedAtoms,
              },
            },
          });

          await tx.shipmentLine.create({
            data: {
              workspaceId,
              shipmentId: shipment.id,
              itemId: line.itemId,
              lotId: line.lotId,
              sourceLocationId: line.sourceLocationId,
              allocatedAtoms: line.allocatedAtoms,
              reservationId: reservation.id,
            },
          });
        }

        const fullShipment = await tx.shipment.findUnique({
          where: { id: shipment.id },
          include: {
            lines: {
              include: { item: true, lot: true, sourceLocation: true },
            },
            order: true,
            customer: true,
          },
        });

        return {
          data: fullShipment,
          aggregateType: 'SHIPMENT',
          aggregateId: shipment.id,
          resourceVersion: shipment.version,
        };
      },
    });
  }

  /**
   * Dispatches an allocated shipment.
   * Posts physical MovementType.SHIPMENT out of the warehouse into customer custody.
   * Releases and consumes the hard stock reservation.
   */
  async dispatchShipment(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['delivery.dispatch', 'owner']);
    const input = DispatchShipmentSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const shipment = await findShipmentById(this.db, workspaceId, input.shipmentId);
    if (!shipment) {
      throw new NotFoundError(`Shipment '${input.shipmentId}' not found`);
    }

    if (shipment.status !== ShipmentStatus.ALLOCATED) {
      throw new BadRequestError(
        `Cannot dispatch shipment in status '${shipment.status}'. Only ALLOCATED shipments can be dispatched.`
      );
    }

    // Find destination Customer location if exists
    const customerLocation = await this.db.location.findFirst({
      where: {
        workspaceId,
        kind: 'CUSTOMER',
        isActive: true,
        archivedAt: null,
      },
    });

    return executeCommand<any, any>({
      principal,
      commandType: 'delivery.shipment.dispatch',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const now = new Date();

        for (const line of shipment.lines) {
          // 1. Post physical shipment movement
          const movement = await postMovement(
            tx,
            principal,
            {
              movementType: MovementType.SHIPMENT,
              itemId: line.itemId,
              sourceLocationId: line.sourceLocationId,
              destinationLocationId: customerLocation ? customerLocation.id : null,
              sourceLotId: line.lotId,
              destinationLotId: line.lotId,
              atoms: line.allocatedAtoms,
              referenceType: MovementReferenceType.SHIPMENT,
              referenceId: shipment.id,
              notes: `Dispatched shipment ${shipment.shipmentNumber}`,
            },
            requestId
          );

          // 2. Consume and release hard reservation
          if (line.reservationId) {
            await tx.stockReservation.update({
              where: { id: line.reservationId },
              data: { status: 'FULFILLED' },
            });
          }

          // 3. Decrement reserved atoms in source stock balance
          const bucketKey = getBucketKey(line.itemId, line.sourceLocationId, line.lotId);
          const sourceBalance = await tx.stockBalance.findUnique({
            where: {
              workspaceId_bucketKey: {
                workspaceId,
                bucketKey,
              },
            },
          });

          if (sourceBalance) {
            await tx.stockBalance.update({
              where: { id: sourceBalance.id },
              data: {
                reservedAtoms: {
                  decrement: line.allocatedAtoms,
                },
              },
            });
          }

          // 4. Update shipment line dispatched atoms and movement link
          await tx.shipmentLine.update({
            where: { id: line.id },
            data: {
              dispatchedAtoms: line.allocatedAtoms,
              movementId: movement.id,
            },
          });
        }

        // 5. Update shipment record
        const updatedShipment = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.DISPATCHED,
            dispatchedAt: now,
            carrierName: input.carrierName || shipment.carrierName,
            trackingNumber: input.trackingNumber || shipment.trackingNumber,
            notes: input.notes || shipment.notes,
            version: { increment: 1 },
          },
          include: {
            lines: {
              include: { item: true, lot: true, sourceLocation: true },
            },
            order: true,
            customer: true,
          },
        });

        // 6. Update order status if in production
        if (shipment.order.status === 'IN_PRODUCTION' || shipment.order.status === 'READY' || shipment.order.status === 'RELEASED') {
          await tx.order.update({
            where: { id: shipment.orderId },
            data: {
              status: 'PARTIALLY_DELIVERED',
              version: { increment: 1 },
            },
          });
        }

        return {
          data: updatedShipment,
          aggregateType: 'SHIPMENT',
          aggregateId: shipment.id,
          resourceVersion: updatedShipment.version,
        };
      },
    });
  }

  /**
   * Confirms final customer delivery with proof of delivery (POD).
   * Transitions shipment to DELIVERED and marks the order DELIVERED if all units are fulfilled.
   */
  async confirmDelivery(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['delivery.confirm', 'delivery.dispatch', 'owner']);
    const input = ConfirmDeliverySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const shipment = await findShipmentById(this.db, workspaceId, input.shipmentId);
    if (!shipment) {
      throw new NotFoundError(`Shipment '${input.shipmentId}' not found`);
    }

    if (shipment.status !== ShipmentStatus.DISPATCHED) {
      throw new BadRequestError(
        `Cannot confirm delivery for shipment in status '${shipment.status}'. Shipment must be DISPATCHED.`
      );
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'delivery.shipment.confirm',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : new Date();

        // Update line delivered atoms
        for (const line of shipment.lines) {
          await tx.shipmentLine.update({
            where: { id: line.id },
            data: {
              deliveredAtoms: line.dispatchedAtoms,
            },
          });
        }

        // Update shipment record
        const updatedShipment = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.DELIVERED,
            deliveredAt,
            proofOfDelivery: input.proofOfDelivery,
            receivedBy: input.receivedBy,
            notes: input.notes || shipment.notes,
            version: { increment: 1 },
          },
          include: {
            lines: {
              include: { item: true, lot: true, sourceLocation: true },
            },
            order: true,
            customer: true,
          },
        });

        // Check if all ordered units for this order are delivered
        const allShipments = await tx.shipment.findMany({
          where: {
            workspaceId,
            orderId: shipment.orderId,
            status: ShipmentStatus.DELIVERED,
          },
          include: { lines: true },
        });

        const totalDeliveredAtoms = allShipments.reduce(
          (acc: bigint, s: any) =>
            acc + s.lines.reduce((lAcc: bigint, l: any) => lAcc + l.deliveredAtoms, 0n),
          0n
        );

        if (totalDeliveredAtoms >= shipment.order.orderedAtoms) {
          await tx.order.update({
            where: { id: shipment.orderId },
            data: {
              status: 'DELIVERED',
              version: { increment: 1 },
            },
          });
        }

        return {
          data: updatedShipment,
          aggregateType: 'SHIPMENT',
          aggregateId: shipment.id,
          resourceVersion: updatedShipment.version,
        };
      },
    });
  }
}

import { db } from '@/server/db/client';
export const deliveryService = new DeliveryService(db);
