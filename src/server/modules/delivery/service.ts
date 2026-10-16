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

function resolveOrderLine(order: any, shipmentLine: { orderLineId?: string; itemId: string }) {
  if (order.lines.length > 0) {
    if (!shipmentLine.orderLineId) {
      throw new BadRequestError('Each shipment allocation must identify its customer order line.');
    }
    const orderLine = order.lines.find(
      (candidate: { id: string; itemId: string }) =>
        candidate.id === shipmentLine.orderLineId && candidate.itemId === shipmentLine.itemId
    );
    if (!orderLine) {
      throw new BadRequestError(
        `Order line '${shipmentLine.orderLineId}' does not belong to order '${order.id}' or item '${shipmentLine.itemId}'.`
      );
    }
    return orderLine;
  }

  if (shipmentLine.orderLineId) {
    throw new BadRequestError(`Order '${order.id}' has no customer order lines.`);
  }
  if (shipmentLine.itemId !== order.itemId) {
    throw new BadRequestError(`Item '${shipmentLine.itemId}' is not part of order '${order.id}'.`);
  }
  return { id: null, itemId: order.itemId, orderedAtoms: order.orderedAtoms };
}

function addQuantity(totals: Map<string, bigint>, key: string, atoms: bigint) {
  totals.set(key, (totals.get(key) ?? 0n) + atoms);
}

async function getFinalQcPassedAtoms(tx: any, order: any, orderLine: any) {
  const lineMatch = orderLine.id
    ? order.lines.filter((line: { itemId: string }) => line.itemId === orderLine.itemId).length === 1
      ? { OR: [{ orderLineId: orderLine.id }, { orderLineId: null }] }
      : { orderLineId: orderLine.id }
    : {};
  const inspections = await tx.inspection.findMany({
    where: {
      workspaceId: order.workspaceId,
      status: 'FINALIZED',
      productionOutput: {
        isFinal: true,
        itemId: orderLine.itemId,
        task: {
          jobsheet: {
            manufacturingOrder: {
              orderId: order.id,
              ...lineMatch,
            },
          },
        },
      },
    },
    select: { passedAtoms: true },
  });
  return inspections.reduce((sum: bigint, inspection: { passedAtoms: bigint }) => sum + inspection.passedAtoms, 0n);
}

function isOrderFullyDelivered(order: any, shipmentLines: Array<any>) {
  if (order.lines.length === 0) {
    const deliveredAtoms = shipmentLines.reduce((total, line) => total + line.deliveredAtoms, 0n);
    return order.orderedAtoms > 0n && deliveredAtoms >= order.orderedAtoms;
  }

  const deliveredByLine = new Map<string, bigint>();
  const ambiguousByItem = new Set<string>();
  for (const shipmentLine of shipmentLines) {
    if (shipmentLine.orderLineId) {
      const orderLine = order.lines.find((line: { id: string; itemId: string }) => line.id === shipmentLine.orderLineId);
      if (orderLine && orderLine.itemId === shipmentLine.itemId) {
        addQuantity(deliveredByLine, orderLine.id, shipmentLine.deliveredAtoms);
      }
      continue;
    }

    const matchingLines = order.lines.filter((line: { itemId: string }) => line.itemId === shipmentLine.itemId);
    if (matchingLines.length === 1) {
      addQuantity(deliveredByLine, matchingLines[0].id, shipmentLine.deliveredAtoms);
    } else if (matchingLines.length > 1 && shipmentLine.deliveredAtoms > 0n) {
      ambiguousByItem.add(shipmentLine.itemId);
    }
  }

  return order.lines.length > 0 && order.lines.every((line: { id: string; itemId: string; orderedAtoms: bigint }) =>
    !ambiguousByItem.has(line.itemId) && (deliveredByLine.get(line.id) ?? 0n) >= line.orderedAtoms
  );
}

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
        lines: true,
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
      resolveOrderLine(order, line);

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

        // Re-read order-line limits and allocated shipment quantities in the committing transaction.
        const currentOrder = await tx.order.findUnique({
          where: { workspaceId_id: { workspaceId, id: order.id } },
          include: { lines: true },
        });
        if (!currentOrder) throw new NotFoundError(`Order '${order.id}' not found`);
        if (currentOrder.status === 'CANCELLED' || currentOrder.status === 'DELIVERED') {
          throw new BadRequestError(`Cannot allocate shipment for order in status '${currentOrder.status}'`);
        }
        const existingLines = await tx.shipmentLine.findMany({
          where: {
            workspaceId,
            shipment: { orderId: order.id, status: { not: 'CANCELLED' } },
          },
        });
        const allocatedByLine = new Map<string, bigint>();
        const ambiguousLegacyByItem = new Map<string, bigint>();
        for (const line of existingLines) {
          if (currentOrder.lines.length === 0) {
            addQuantity(allocatedByLine, `item:${line.itemId}`, line.allocatedAtoms);
            continue;
          }

          if (line.orderLineId) {
            const orderLine = currentOrder.lines.find(
              (candidate: { id: string; itemId: string }) => candidate.id === line.orderLineId
            );
            if (!orderLine || orderLine.itemId !== line.itemId) {
              throw new BadRequestError(`Existing shipment line '${line.id}' has an invalid order-line link.`);
            }
            addQuantity(allocatedByLine, `line:${orderLine.id}`, line.allocatedAtoms);
            continue;
          }

          const candidates = currentOrder.lines.filter(
            (candidate: { itemId: string }) => candidate.itemId === line.itemId
          );
          if (candidates.length === 1) {
            addQuantity(allocatedByLine, `line:${candidates[0].id}`, line.allocatedAtoms);
          } else if (candidates.length > 1) {
            addQuantity(ambiguousLegacyByItem, line.itemId, line.allocatedAtoms);
          }
        }
        for (const line of input.lines) {
          const orderLine = resolveOrderLine(currentOrder, line);
          if (orderLine.id && (ambiguousLegacyByItem.get(line.itemId) ?? 0n) > 0n) {
            throw new BadRequestError(
              `Existing shipment quantities for item '${line.itemId}' cannot be attributed to a specific order line. Reconcile those historical shipment lines before allocating more of this item.`
            );
          }
          const allocationKey = orderLine.id ? `line:${orderLine.id}` : `item:${line.itemId}`;
          const nextAllocated = (allocatedByLine.get(allocationKey) ?? 0n) + line.allocatedAtoms;
          if (nextAllocated > orderLine.orderedAtoms) {
            throw new BadRequestError(
              `Shipment allocation for order line '${orderLine.id ?? line.itemId}' exceeds its ordered quantity (${orderLine.orderedAtoms} atoms).`
            );
          }
          const finalQcPassedAtoms = await getFinalQcPassedAtoms(tx, currentOrder, orderLine);
          if (nextAllocated > finalQcPassedAtoms) {
            throw new BadRequestError(
              `Shipment allocation for order line '${orderLine.id ?? line.itemId}' exceeds finalized QC-passed quantity (${finalQcPassedAtoms} atoms).`
            );
          }
          allocatedByLine.set(allocationKey, nextAllocated);
        }

        // Create shipment lines and stock reservations
        for (const line of input.lines) {
          const sourceLocation = await tx.location.findFirst({
            where: { id: line.sourceLocationId, workspaceId, isActive: true, archivedAt: null },
          });
          if (!sourceLocation || sourceLocation.kind !== 'FG') {
            throw new BadRequestError('Shipment source must remain an active Finished Goods location at commit time.');
          }
          const bucketKey = getBucketKey(line.itemId, line.sourceLocationId, line.lotId);
          const balance = await tx.stockBalance.findUnique({
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
              `Insufficient available stock for item in source location. Required: ${line.allocatedAtoms} atoms, Available: ${available} atoms.`
            );
          }

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
// bucketKey already resolved
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
              orderLineId: resolveOrderLine(currentOrder, line).id,
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

        const currentShipment = await tx.shipment.findUnique({
          where: { id: input.shipmentId },
          include: { lines: true },
        });
        if (!currentShipment || currentShipment.status !== ShipmentStatus.ALLOCATED) {
          throw new BadRequestError(
            `Cannot dispatch shipment in status '${currentShipment?.status}'. Only ALLOCATED shipments can be dispatched.`
          );
        }

        for (const line of currentShipment.lines) {
          const sourceBucketKey = getBucketKey(line.itemId, line.sourceLocationId, line.lotId);
          const reservedBalance = await tx.stockBalance.findUnique({
            where: { workspaceId_bucketKey: { workspaceId, bucketKey: sourceBucketKey } },
          });
          if (!reservedBalance || reservedBalance.reservedAtoms < line.allocatedAtoms) {
            throw new BadRequestError(
              `Shipment line '${line.id}' no longer has its full stock reservation; dispatch was cancelled.`
            );
          }
          if (line.reservationId) {
            const reservation = await tx.stockReservation.findUnique({ where: { id: line.reservationId } });
            if (!reservation || reservation.status !== 'ACTIVE' || reservation.reservedAtoms < line.allocatedAtoms) {
              throw new BadRequestError(
                `Shipment line '${line.id}' has no active reservation for its allocated quantity.`
              );
            }
          }

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
          if (line.orderLineId) {
            await tx.orderLine.update({
              where: { id: line.orderLineId },
              data: { shippedAtoms: { increment: line.allocatedAtoms } },
            });
          }
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

        const currentShipment = await tx.shipment.findUnique({
          where: { id: input.shipmentId },
          include: { lines: true },
        });
        if (!currentShipment || currentShipment.status !== ShipmentStatus.DISPATCHED) {
          throw new BadRequestError(
            `Cannot confirm delivery for shipment in status '${currentShipment?.status}'. Shipment must be DISPATCHED.`
          );
        }

        // Update line delivered atoms
        for (const line of currentShipment.lines) {
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
        const currentOrder = await tx.order.findUnique({
          where: { workspaceId_id: { workspaceId, id: shipment.orderId } },
          include: { lines: true },
        });

        if (currentOrder && isOrderFullyDelivered(currentOrder, allShipments.flatMap((s: any) => s.lines))) {
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
