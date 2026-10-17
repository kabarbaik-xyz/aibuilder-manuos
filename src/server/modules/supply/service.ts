import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission, requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { SupplyRepository } from './repository';
import { postMovement } from '../inventory/ledger';
import { MovementType, MovementReferenceType } from '../inventory/contracts';
import {
  CreateSupplyOrderInput,
  CreateSupplyOrderSchema,
  ChangeSupplyEtaInput,
  ChangeSupplyEtaSchema,
  ReceiveSupplyInput,
  ReceiveSupplySchema,
  SupplyOrderStatus,
  SupplyOrderDTO,
  SupplyReceiptDTO,
  SetMaterialSupplyAllocationsInput,
  SetMaterialSupplyAllocationsSchema,
} from './contracts';

export class SupplyService {
  private readonly repo: SupplyRepository;

  constructor(private readonly db: PrismaClient) {
    this.repo = new SupplyRepository(db);
  }

  async createSupplyOrder(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'supply.create');
    const input: CreateSupplyOrderInput = CreateSupplyOrderSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // Validate supplier
    const supplier = await this.db.supplier.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.supplierId,
        },
      },
    });

    if (!supplier || !supplier.isActive) {
      throw new NotFoundError(`Supplier '${input.supplierId}' not found or inactive`);
    }

    // Validate all items
    for (const line of input.lines) {
      const item = await this.db.item.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: line.itemId,
          },
        },
      });
      if (!item || !item.isActive) {
        throw new NotFoundError(`Item '${line.itemId}' not found or inactive`);
      }
    }

    return executeCommand({
      principal,
      commandType: 'supply.create_order',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx: Prisma.TransactionClient) => {
        const orderNumber = await this.repo.nextSequence(workspaceId, 'SUPPLY_ORDER', 'PO', tx);

        const order = await tx.supplyOrder.create({
          data: {
            workspaceId,
            orderNumber,
            supplierId: input.supplierId,
            status: SupplyOrderStatus.DRAFT,
            expectedDate: new Date(input.expectedDate),
            notes: input.notes,
            version: 1,
            lines: {
              create: input.lines.map((l) => ({
                itemId: l.itemId,
                orderedAtoms: l.orderedAtoms,
                receivedAtoms: 0n,
                unitPriceCents: l.unitPriceCents ?? null,
                notes: l.notes ?? null,
                version: 1,
              })),
            },
          },
        });

        const dto = await new SupplyRepository(tx).findOrderById(workspaceId, order.id);

        return {
          data: dto!,
          aggregateType: 'SUPPLY_ORDER',
          aggregateId: order.id,
          resourceVersion: order.version,
        };
      },
    });
  }

  async approveSupplyOrder(
    principal: Principal,
    orderId: string,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'supply.approve');
    const workspaceId = principal.workspaceId;

    const order = await this.db.supplyOrder.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: orderId,
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Supply order '${orderId}' not found`);
    }

    if (order.status !== SupplyOrderStatus.DRAFT) {
      throw new BadRequestError(`Cannot approve supply order in status '${order.status}'`);
    }

    return executeCommand({
      principal,
      commandType: 'supply.approve_order',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { orderId },
      prismaClient: this.db,
      handler: async (tx) => {
        const updated = await tx.supplyOrder.update({
          where: { id: order.id },
          data: {
            status: SupplyOrderStatus.APPROVED,
            approvedById: principal.userId,
            approvedAt: new Date(),
            version: { increment: 1 },
          },
        });

        const dto = await new SupplyRepository(tx).findOrderById(workspaceId, order.id);

        return {
          data: dto!,
          aggregateType: 'SUPPLY_ORDER',
          aggregateId: order.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async changeSupplyEta(
    principal: Principal,
    orderId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'supply.change_eta');
    const input: ChangeSupplyEtaInput = ChangeSupplyEtaSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const order = await this.db.supplyOrder.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: orderId,
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Supply order '${orderId}' not found`);
    }

    if (order.status === SupplyOrderStatus.CANCELLED || order.status === SupplyOrderStatus.RECEIVED) {
      throw new BadRequestError(`Cannot change ETA for supply order in status '${order.status}'`);
    }

    return executeCommand({
      principal,
      commandType: 'supply.change_eta',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { orderId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const updated = await tx.supplyOrder.update({
          where: { id: order.id },
          data: {
            expectedDate: new Date(input.expectedDate),
            notes: input.reason
              ? `${order.notes ? order.notes + ' | ' : ''}ETA changed: ${input.reason}`
              : order.notes,
            version: { increment: 1 },
          },
        });

        const dto = await new SupplyRepository(tx).findOrderById(workspaceId, order.id);

        return {
          data: dto!,
          aggregateType: 'SUPPLY_ORDER',
          aggregateId: order.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async allocateMaterialDemand(
    principal: Principal,
    supplyOrderId: string,
    rawInput: unknown,
    idempotencyKey?: string,
  ) {
    requireAnyPermission(principal, ['supply.create', 'planning.write']);
    const input: SetMaterialSupplyAllocationsInput = SetMaterialSupplyAllocationsSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;
    const order = await this.db.supplyOrder.findFirst({
      where: { workspaceId, id: supplyOrderId },
      select: { id: true, status: true, version: true },
    });
    if (!order) throw new NotFoundError(`Supply order '${supplyOrderId}' not found`);
    if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new BadRequestError('Material allocations can be changed only for approved, open supply orders.');
    }

    return executeCommand({
      principal,
      commandType: 'supply.allocate_material_demand',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { supplyOrderId, ...input },
      prismaClient: this.db,
      handler: async (tx: Prisma.TransactionClient) => {
        const currentOrder = await tx.supplyOrder.findFirst({
          where: { workspaceId, id: supplyOrderId },
          include: { lines: true },
        });
        if (!currentOrder || currentOrder.status !== order.status || currentOrder.version !== order.version) {
          throw new ConflictError('The supply order changed while allocations were being reviewed. Reload and try again.', 'STALE_VERSION', true);
        }
        const lineById = new Map(currentOrder.lines.map((line) => [line.id, line]));
        const currentAllocations = await tx.materialSupplyAllocation.findMany({
          where: { workspaceId, supplyOrderLineId: { in: currentOrder.lines.map(({ id }) => id) } },
        });
        const requestedDemandIds = [...new Set(input.allocations.map(({ demandId }) => demandId))];
        const demandIds = [...new Set([...requestedDemandIds, ...currentAllocations.map(({ demandId }) => demandId)])];
        const demands = demandIds.length ? await tx.materialDemand.findMany({
          where: { workspaceId, id: { in: demandIds } },
          include: { order: { select: { id: true, orderNumber: true, status: true, facilityId: true } }, reservations: { where: { status: 'ACTIVE' }, select: { reservedAtoms: true, supplyReceiptDemandAllocation: { select: { id: true } } } } },
        }) : [];
        const demandById = new Map(demands.map((demand) => [demand.id, demand]));
        const grantedFacilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);

        const allocationsByLine = new Map<string, bigint>();
        const allocationsByDemand = new Map<string, bigint>();
        for (const allocation of input.allocations) {
          const line = lineById.get(allocation.supplyOrderLineId);
          const demand = demandById.get(allocation.demandId);
          if (!line || !demand) throw new NotFoundError('Supply line or material demand not found in this workspace/order.');
          if (line.itemId !== demand.itemId || demand.status === 'CLOSED' || !['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(demand.order.status)) {
            throw new BadRequestError('A supply allocation must match the item on an open material demand.');
          }
          if (demand.order.facilityId && !grantedFacilityIds.includes(demand.order.facilityId)) {
            throw new NotFoundError(`Material demand '${demand.id}' not found`);
          }
          allocationsByLine.set(allocation.supplyOrderLineId, (allocationsByLine.get(allocation.supplyOrderLineId) ?? 0n) + allocation.allocatedAtoms);
          allocationsByDemand.set(allocation.demandId, (allocationsByDemand.get(allocation.demandId) ?? 0n) + allocation.allocatedAtoms);
        }

        for (const line of currentOrder.lines) {
          const requestedTotal = allocationsByLine.get(line.id) ?? 0n;
          const receivedTotal = currentAllocations
            .filter((allocation) => allocation.supplyOrderLineId === line.id)
            .reduce((sum, allocation) => sum + allocation.receivedAtoms, 0n);
          const nextTotal = requestedTotal > receivedTotal ? requestedTotal - receivedTotal : 0n;
          const openAtoms = line.orderedAtoms - line.receivedAtoms;
          if (nextTotal > openAtoms) throw new BadRequestError(`Allocations exceed open PO quantity for line '${line.id}'.`);
        }

        const currentByPair = new Map(currentAllocations.map((allocation) => [`${allocation.supplyOrderLineId}:${allocation.demandId}`, allocation]));
        const affectedDemandIds = new Set([...demandIds, ...currentAllocations.map(({ demandId }) => demandId)]);
        for (const demandId of affectedDemandIds) {
          const demand = demandById.get(demandId);
          if (!demand) continue;
          // Receipt-backed reservations are already represented by their PO allocation; count
          // independent reservations here so the same atoms are not committed twice.
          const activeReservedAtoms = demand.reservations
            .filter((reservation) => !reservation.supplyReceiptDemandAllocation)
            .reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
          const otherAllocatedAtoms = await tx.materialSupplyAllocation.aggregate({
            where: { workspaceId, demandId, supplyOrderLine: { supplyOrderId: { not: supplyOrderId } } },
            _sum: { allocatedAtoms: true },
          });
          const allowedAtoms = demand.requiredAtoms > activeReservedAtoms + (otherAllocatedAtoms._sum.allocatedAtoms ?? 0n)
            ? demand.requiredAtoms - activeReservedAtoms - (otherAllocatedAtoms._sum.allocatedAtoms ?? 0n)
            : 0n;
          const requestedAtoms = allocationsByDemand.get(demandId) ?? 0n;
          if (requestedAtoms > allowedAtoms) throw new BadRequestError(`Allocation exceeds unreserved and unallocated demand for '${demandId}'.`);
        }

        const desiredPairs = new Set(input.allocations.map(({ supplyOrderLineId, demandId }) => `${supplyOrderLineId}:${demandId}`));
        for (const existing of currentAllocations) {
          const key = `${existing.supplyOrderLineId}:${existing.demandId}`;
          const next = input.allocations.find(({ supplyOrderLineId, demandId }) => `${supplyOrderLineId}:${demandId}` === key);
          const nextAtoms = next?.allocatedAtoms ?? 0n;
          if (nextAtoms < existing.receivedAtoms || nextAtoms < existing.reservedAtoms) {
            throw new BadRequestError('An allocation cannot be reduced below the quantity already received or reserved.');
          }
          if (!desiredPairs.has(key)) {
            await tx.materialSupplyAllocation.delete({ where: { workspaceId_id: { workspaceId, id: existing.id } } });
          } else if (nextAtoms !== existing.allocatedAtoms) {
            await tx.materialSupplyAllocation.update({
              where: { workspaceId_id: { workspaceId, id: existing.id } },
              data: { allocatedAtoms: nextAtoms, version: { increment: 1 } },
            });
          }
        }
        for (const allocation of input.allocations) {
          if (currentByPair.has(`${allocation.supplyOrderLineId}:${allocation.demandId}`)) continue;
          await tx.materialSupplyAllocation.create({ data: { workspaceId, ...allocation } });
        }

        const saved = await tx.materialSupplyAllocation.findMany({
          where: { workspaceId, supplyOrderLine: { supplyOrderId } },
          include: { demand: { include: { order: { select: { id: true, orderNumber: true }, } } }, supplyOrderLine: { select: { id: true, itemId: true } } },
          orderBy: [{ supplyOrderLineId: 'asc' }, { createdAt: 'asc' }],
        });
        const data = saved.map((allocation) => ({
          id: allocation.id,
          supplyOrderLineId: allocation.supplyOrderLineId,
          demandId: allocation.demandId,
          orderId: allocation.demand.order.id,
          orderNumber: allocation.demand.order.orderNumber,
          itemId: allocation.supplyOrderLine.itemId,
          allocatedAtoms: allocation.allocatedAtoms,
          receivedAtoms: allocation.receivedAtoms,
          reservedAtoms: allocation.reservedAtoms,
          version: allocation.version,
        }));
        return { data: { allocations: data }, aggregateType: 'SUPPLY_ORDER', aggregateId: supplyOrderId, resourceVersion: currentOrder.version };
      },
    });
  }

  async getMaterialDemandAllocationContext(principal: Principal, supplyOrderId: string) {
    requireAnyPermission(principal, ['supply.read', 'supply.create', 'planning.write']);
    const order = await this.db.supplyOrder.findFirst({
      where: { workspaceId: principal.workspaceId, id: supplyOrderId },
      include: { lines: { include: { item: { select: { id: true, code: true, name: true, baseUom: { select: { code: true, precision: true } } } } } } },
    });
    if (!order) throw new NotFoundError(`Supply order '${supplyOrderId}' not found`);
    const lineIds = order.lines.map(({ id }) => id);
    const itemIds = [...new Set(order.lines.map(({ itemId }) => itemId))];
    const [currentAllocations, demands] = await Promise.all([
      lineIds.length ? this.db.materialSupplyAllocation.findMany({
        where: { workspaceId: principal.workspaceId, supplyOrderLineId: { in: lineIds } },
        select: { supplyOrderLineId: true, demandId: true, allocatedAtoms: true },
      }) : [],
      itemIds.length ? this.db.materialDemand.findMany({
        where: {
          workspaceId: principal.workspaceId,
          itemId: { in: itemIds },
          status: { in: ['OPEN', 'ALLOCATED'] },
          order: { status: { in: ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'] } },
        },
        include: {
          item: { select: { id: true, code: true, name: true, baseUom: { select: { code: true, precision: true } } } },
          order: { select: { id: true, orderNumber: true, facilityId: true } },
          reservations: { where: { status: 'ACTIVE' }, select: { reservedAtoms: true, supplyReceiptDemandAllocation: { select: { id: true } } } },
          supplyAllocations: { where: { supplyOrderLine: { supplyOrderId: { not: supplyOrderId } } }, select: { allocatedAtoms: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
      }) : [],
    ]);
    const grantedFacilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
    const currentByPair = new Map(currentAllocations.map((allocation) => [`${allocation.supplyOrderLineId}:${allocation.demandId}`, allocation.allocatedAtoms]));
    const candidates = order.lines.flatMap((line) => demands
      .filter((demand) => demand.itemId === line.itemId && (!demand.order.facilityId || grantedFacilityIds.includes(demand.order.facilityId)))
      .map((demand) => {
        const allReservedAtoms = demand.reservations.reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
        const reservedAtoms = demand.reservations
          .filter((reservation) => !reservation.supplyReceiptDemandAllocation)
          .reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
        const alreadyAllocatedAtoms = demand.supplyAllocations.reduce((sum, allocation) => sum + allocation.allocatedAtoms, 0n);
        const capacity = demand.requiredAtoms > reservedAtoms + alreadyAllocatedAtoms ? demand.requiredAtoms - reservedAtoms - alreadyAllocatedAtoms : 0n;
        return {
          supplyOrderLineId: line.id,
          supplyOrderLineItemCode: line.item.code,
          supplyOrderLineItemName: line.item.name,
          id: demand.id,
          orderId: demand.order.id,
          orderNumber: demand.order.orderNumber,
          itemId: demand.itemId,
          itemCode: demand.item.code,
          itemName: demand.item.name,
          uomCode: demand.item.baseUom.code,
          quantityPrecision: demand.item.baseUom.precision,
          requiredAtoms: demand.requiredAtoms,
          reservedAtoms: allReservedAtoms,
          alreadyAllocatedAtoms,
          availableToAllocateAtoms: capacity,
          currentAllocatedAtoms: currentByPair.get(`${line.id}:${demand.id}`) ?? 0n,
        };
      }));

    return {
      data: {
        supplyOrderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        lines: order.lines.map((line) => ({
          id: line.id,
          itemCode: line.item.code,
          itemName: line.item.name,
          uomCode: line.item.baseUom.code,
          quantityPrecision: line.item.baseUom.precision,
          openAtoms: line.orderedAtoms - line.receivedAtoms,
          allocatedAtoms: currentAllocations.filter((allocation) => allocation.supplyOrderLineId === line.id)
            .reduce((sum, allocation) => sum + allocation.allocatedAtoms, 0n),
        })),
        candidates,
      },
    };
  }

  async receiveSupply(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'inventory.receive');
    const input: ReceiveSupplyInput = ReceiveSupplySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const order = await this.db.supplyOrder.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.supplyOrderId,
        },
      },
      include: {
        lines: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Supply order '${input.supplyOrderId}' not found`);
    }

    if (
      order.status !== SupplyOrderStatus.APPROVED &&
      order.status !== SupplyOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestError(
        `Cannot receive supply against order in status '${order.status}' (must be APPROVED or PARTIALLY_RECEIVED)`
      );
    }

    return executeCommand({
      principal,
      commandType: 'inventory.receive_supply',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const repo = new SupplyRepository(tx);
        const receiptNumber =
          input.receiptNumber || (await repo.nextSequence(workspaceId, 'SUPPLY_RECEIPT', 'REC'));

        const receipt = await tx.supplyReceipt.create({
          data: {
            workspaceId,
            receiptNumber,
            supplyOrderId: order.id,
            supplierId: order.supplierId,
            receivedDate: input.receivedDate ? new Date(input.receivedDate) : new Date(),
            notes: input.notes,
            receivedById: principal.userId,
          },
        });

        for (const lineInput of input.lines) {
          const line = order.lines.find((l) => l.id === lineInput.supplyOrderLineId);
          if (!line) {
            throw new NotFoundError(
              `Supply order line '${lineInput.supplyOrderLineId}' not found on order '${order.orderNumber}'`
            );
          }

          const remainingAtoms = line.orderedAtoms - line.receivedAtoms;
          if (lineInput.receivedAtoms > remainingAtoms) {
            throw new BadRequestError(
              `Over-receipt rejected for item '${line.item.code}'. Remaining open: ${remainingAtoms} atoms, Requested: ${lineInput.receivedAtoms} atoms`
            );
          }

          const lineAllocations = await tx.materialSupplyAllocation.findMany({
            where: { workspaceId, supplyOrderLineId: line.id },
            select: { allocatedAtoms: true, receivedAtoms: true },
          });
          const outstandingLinkedAtoms = lineAllocations.reduce((sum: bigint, allocation: { allocatedAtoms: bigint; receivedAtoms: bigint }) => {
            const outstanding = allocation.allocatedAtoms - allocation.receivedAtoms;
            return sum + (outstanding > 0n ? outstanding : 0n);
          }, 0n);
          const expectedLinkedReceiptAtoms = outstandingLinkedAtoms < lineInput.receivedAtoms
            ? outstandingLinkedAtoms
            : lineInput.receivedAtoms;
          const suppliedLinkedReceiptAtoms = lineInput.demandAllocations.reduce((sum, split) => sum + split.receivedAtoms, 0n);
          if (suppliedLinkedReceiptAtoms !== expectedLinkedReceiptAtoms) {
            throw new BadRequestError(`Receipt for '${line.item.code}' must link exactly ${expectedLinkedReceiptAtoms} atoms to its existing material-demand allocations.`);
          }

          // Handle lot creation if item is LOT tracked
          let lotId: string | null = null;
          if (line.item.tracking === 'LOT') {
            if (!lineInput.lotNumber) {
              throw new BadRequestError(
                `Item '${line.item.code}' is LOT tracked; lotNumber is required for incoming receipt`
              );
            }

            let lot = await tx.lot.findUnique({
              where: {
                workspaceId_itemId_lotNumber: {
                  workspaceId,
                  itemId: line.itemId,
                  lotNumber: lineInput.lotNumber,
                },
              },
            });

            if (!lot) {
              lot = await tx.lot.create({
                data: {
                  workspaceId,
                  itemId: line.itemId,
                  lotNumber: lineInput.lotNumber,
                  supplierLotNumber: lineInput.supplierLotNumber,
                  expirationDate: lineInput.expirationDate
                    ? new Date(lineInput.expirationDate)
                    : undefined,
                  notes: lineInput.notes,
                },
              });
            }
            lotId = lot.id;
          }

          // Post double-entry movement from external supplier boundary into destination location
          const movement = await postMovement(
            tx,
            principal,
            {
              movementType: MovementType.PURCHASE_RECEIPT,
              itemId: line.itemId,
              destinationLocationId: lineInput.locationId,
              destinationLotId: lotId,
              atoms: lineInput.receivedAtoms,
              referenceType: MovementReferenceType.SUPPLY_ORDER,
              referenceId: order.id,
              notes: lineInput.notes ?? `Received against PO ${order.orderNumber}`,
            },
            requestId
          );

          const receiptLine = await tx.supplyReceiptLine.create({
            data: {
              workspaceId,
              receiptId: receipt.id,
              supplyOrderLineId: line.id,
              itemId: line.itemId,
              locationId: lineInput.locationId,
              lotId,
              receivedAtoms: lineInput.receivedAtoms,
              movementId: movement.id,
              notes: lineInput.notes,
            },
          });

          const location = await tx.location.findUnique({
            where: { workspaceId_id: { workspaceId, id: lineInput.locationId } },
            select: { id: true, kind: true },
          });
          if (!location) throw new NotFoundError(`Receipt location '${lineInput.locationId}' not found`);

          for (const split of lineInput.demandAllocations) {
            const allocation = await tx.materialSupplyAllocation.findUnique({
              where: { workspaceId_demandId_supplyOrderLineId: {
                workspaceId,
                demandId: split.demandId,
                supplyOrderLineId: line.id,
              } },
              include: { demand: { include: { order: true } } },
            });
            if (!allocation) throw new BadRequestError(`Demand '${split.demandId}' is not allocated to PO line '${line.id}'.`);
            if (allocation.demand.itemId !== line.itemId || !['OPEN', 'ALLOCATED'].includes(allocation.demand.status)) {
              throw new BadRequestError(`Demand '${split.demandId}' is no longer an open demand for this PO item.`);
            }
            if (split.receivedAtoms > allocation.allocatedAtoms - allocation.receivedAtoms) {
              throw new BadRequestError(`Receipt allocation exceeds the remaining quantity allocated to demand '${split.demandId}'.`);
            }

            const receiptAllocation = await tx.materialSupplyReceiptAllocation.create({
              data: {
                workspaceId,
                receiptLineId: receiptLine.id,
                supplyAllocationId: allocation.id,
                demandId: allocation.demandId,
                receivedAtoms: split.receivedAtoms,
              },
            });

            let reservedAtoms = 0n;
            if (location.kind === 'RAW') {
              const bucketKey = `${line.itemId}:${location.id}:${lotId || '__NO_LOT__'}`;
              const balance = await tx.stockBalance.findUnique({
                where: { workspaceId_bucketKey: { workspaceId, bucketKey } },
              });
              if (!balance || balance.onHandAtoms - balance.reservedAtoms < split.receivedAtoms) {
                throw new BadRequestError(`Received stock is not available to reserve for demand '${split.demandId}'.`);
              }
              const changed = await tx.stockBalance.updateMany({
                where: { id: balance.id, version: balance.version },
                data: { reservedAtoms: { increment: split.receivedAtoms }, version: { increment: 1 } },
              });
              if (changed.count !== 1) throw new ConflictError(`Concurrent reservation conflict for received stock bucket '${bucketKey}'.`);
              const reservation = await tx.stockReservation.create({
                data: {
                  workspaceId,
                  demandId: allocation.demandId,
                  orderId: allocation.demand.orderId,
                  taskId: allocation.demand.taskId,
                  itemId: line.itemId,
                  locationId: location.id,
                  lotId,
                  reservedAtoms: split.receivedAtoms,
                  status: 'ACTIVE',
                },
              });
              reservedAtoms = split.receivedAtoms;
              await tx.materialSupplyReceiptAllocation.update({
                where: { id: receiptAllocation.id },
                data: { reservedAtoms, stockReservationId: reservation.id },
              });
            }

            const allocationUpdate = await tx.materialSupplyAllocation.updateMany({
              where: { id: allocation.id, version: allocation.version },
              data: {
                receivedAtoms: { increment: split.receivedAtoms },
                reservedAtoms: { increment: reservedAtoms },
                version: { increment: 1 },
              },
            });
            if (allocationUpdate.count !== 1) throw new ConflictError(`Concurrent demand allocation conflict for '${split.demandId}'.`);

            if (reservedAtoms > 0n) {
              const activeReservations = await tx.stockReservation.findMany({
                where: { workspaceId, demandId: split.demandId, status: 'ACTIVE' },
                select: { reservedAtoms: true },
              });
              if (activeReservations.reduce((sum: bigint, reservation: { reservedAtoms: bigint }) => sum + reservation.reservedAtoms, 0n) >= allocation.demand.requiredAtoms && allocation.demand.status === 'OPEN') {
                await tx.materialDemand.update({ where: { id: split.demandId }, data: { status: 'ALLOCATED', version: { increment: 1 } } });
              }
            }
          }

          // Update line receivedAtoms
          await tx.supplyOrderLine.update({
            where: { id: line.id },
            data: {
              receivedAtoms: { increment: lineInput.receivedAtoms },
              version: { increment: 1 },
            },
          });
        }

        // Recalculate order status
        const updatedLines = await tx.supplyOrderLine.findMany({
          where: { supplyOrderId: order.id },
        });

        const isFullyReceived = updatedLines.every((l: { receivedAtoms: bigint; orderedAtoms: bigint }) => l.receivedAtoms >= l.orderedAtoms);
        const newStatus = isFullyReceived
          ? SupplyOrderStatus.RECEIVED
          : SupplyOrderStatus.PARTIALLY_RECEIVED;

        await tx.supplyOrder.update({
          where: { id: order.id },
          data: {
            status: newStatus,
            version: { increment: 1 },
          },
        });

        const receiptList = await repo.listReceipts(workspaceId, { supplyOrderId: order.id });
        const receiptDTO = receiptList.find((r) => r.id === receipt.id)!;

        return {
          data: receiptDTO,
          aggregateType: 'SUPPLY_RECEIPT',
          aggregateId: receipt.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async getOrderById(principal: Principal, orderId: string): Promise<SupplyOrderDTO> {
    requirePermission(principal, 'supply.read');
    const order = await this.repo.findOrderById(principal.workspaceId, orderId);
    if (!order) {
      throw new NotFoundError(`Supply order '${orderId}' not found`);
    }
    return order;
  }

  async listOrders(
    principal: Principal,
    filters: { supplierId?: string; status?: string } = {}
  ): Promise<SupplyOrderDTO[]> {
    requirePermission(principal, 'supply.read');
    return this.repo.listOrders(principal.workspaceId, filters);
  }

  async listReceipts(
    principal: Principal,
    filters: { supplyOrderId?: string } = {}
  ): Promise<SupplyReceiptDTO[]> {
    requirePermission(principal, 'inventory.read');
    return this.repo.listReceipts(principal.workspaceId, filters);
  }
}

import { db } from '@/server/db/client';
export const supplyService = new SupplyService(db);
