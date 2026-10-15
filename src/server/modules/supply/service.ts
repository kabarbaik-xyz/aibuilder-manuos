import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
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
      handler: async (tx) => {
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

          // Create receipt line
          await tx.supplyReceiptLine.create({
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
