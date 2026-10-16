import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission, requireAnyPermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError, ForbiddenError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import * as contracts from './contracts';

export class OrderService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  // -----------------------------------------------------------
  // List & Get
  // -----------------------------------------------------------
  async listOrders(
    principal: Principal,
    filter?: { customerId?: string; status?: string }
  ) {
    requireAnyPermission(principal, ['order.read', 'customer_order.read_own']);

    // Scoped customer user can only view their own company's orders
    const effectiveCustomerId = principal.customerId || filter?.customerId;

    return this.prisma.order.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: {
        customer: true,
        orderType: true,
        item: true,
        lines: {
          include: {
            item: true,
            uom: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
        engineeringRevisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(principal: Principal, id: string) {
    requireAnyPermission(principal, ['order.read', 'customer_order.read_own']);

    const order = await this.prisma.order.findFirst({
      where: { id, workspaceId: principal.workspaceId },
      include: {
        customer: true,
        orderType: true,
        item: { include: { baseUom: true } },
        facility: true,
        questions: { orderBy: { createdAt: 'asc' } },
        rfqDrafts: { orderBy: { createdAt: 'desc' } },
        lines: {
          include: {
            item: { include: { baseUom: true } },
            uom: true,
            manufacturingOrders: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
        engineeringRevisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            bomLines: {
              include: {
                item: true,
                inputUom: true,
              },
            },
          },
        },
        instances: {
          include: {
            tasks: {
              include: {
                assignedTechnician: true,
                assignedMachine: true,
              },
            },
          },
        },
        demands: {
          include: {
            item: {
              include: {
                baseUom: true,
              },
            },
          },
        },
        shipments: {
          orderBy: { createdAt: 'desc' },
          include: {
            lines: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError(`Order '${id}' not found`);

    if (principal.customerId && order.customerId !== principal.customerId) {
      throw new ForbiddenError(`Access denied: customer user cannot access order '${id}'`);
    }

    return order;
  }

  // -----------------------------------------------------------
  // Create Order Draft
  // -----------------------------------------------------------
  async createOrderDraft(
    principal: Principal,
    input: contracts.CreateOrderDraftInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.draft.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        // Customer check
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!customer) throw new BadRequestError(`Customer '${input.customerId}' not found or inactive`);

        // OrderType check
        const orderType = await tx.orderType.findFirst({
          where: { id: input.orderTypeId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!orderType) throw new BadRequestError(`OrderType '${input.orderTypeId}' not found or inactive`);

        // Optional Facility check
        if (input.facilityId) {
          const facility = await tx.facility.findFirst({
            where: { id: input.facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          });
          if (!facility) throw new BadRequestError(`Facility '${input.facilityId}' not found or inactive`);
        }

        // Determine primary item and lines
        const hasExplicitLines = input.lines && input.lines.length > 0;
        let primaryItemId = input.itemId;
        let totalOrderedAtoms = 0n;

        if (hasExplicitLines) {
          if (!primaryItemId) {
            primaryItemId = input.lines![0].itemId;
          }
          for (const line of input.lines!) {
            const item = await tx.item.findFirst({
              where: { id: line.itemId, workspaceId: principal.workspaceId, archivedAt: null },
            });
            if (!item) throw new BadRequestError(`Item '${line.itemId}' not found or inactive`);

            if (line.uomId) {
              const uom = await tx.uom.findFirst({
                where: { id: line.uomId, workspaceId: principal.workspaceId, isActive: true },
              });
              if (!uom) throw new BadRequestError(`UOM '${line.uomId}' not found or inactive`);
            }

            totalOrderedAtoms += BigInt(Math.round(line.orderedQuantity * 1_000_000));
          }
        } else {
          if (!primaryItemId) {
            throw new BadRequestError('Either itemId or lines must be provided to create an order draft');
          }
          const item = await tx.item.findFirst({
            where: { id: primaryItemId, workspaceId: principal.workspaceId, archivedAt: null },
          });
          if (!item) throw new BadRequestError(`Item '${primaryItemId}' not found or inactive`);

          const qty = input.orderedQuantity ?? 1;
          totalOrderedAtoms = BigInt(Math.round(qty * 1_000_000));
        }

        // Generate Order Number transaction-safely
        const count = await tx.order.count({
          where: { workspaceId: principal.workspaceId },
        });
        const orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;

        const requestedDate = new Date(input.requestedDate);
        const promisedDate = input.promisedDate ? new Date(input.promisedDate) : null;

        const order = await tx.order.create({
          data: {
            workspaceId: principal.workspaceId,
            orderNumber,
            customerId: input.customerId,
            orderTypeId: input.orderTypeId,
            itemId: primaryItemId,
            orderedAtoms: totalOrderedAtoms,
            requestedDate,
            promisedDate,
            facilityId: input.facilityId,
            deliveryAddress: input.deliveryAddress,
            contractReference: input.contractReference,
            status: 'DRAFT',
          },
          include: {
            customer: true,
            orderType: true,
            item: true,
          },
        });

        // Create OrderLines
        if (hasExplicitLines) {
          for (let i = 0; i < input.lines!.length; i++) {
            const line = input.lines![i];
            const lineAtoms = BigInt(Math.round(line.orderedQuantity * 1_000_000));
            const lineReqDate = line.requestedDate ? new Date(line.requestedDate) : requestedDate;
            const linePromDate = line.promisedDate ? new Date(line.promisedDate) : promisedDate;

            await tx.orderLine.create({
              data: {
                workspaceId: principal.workspaceId,
                orderId: order.id,
                lineNumber: i + 1,
                itemId: line.itemId,
                uomId: line.uomId,
                orderedAtoms: lineAtoms,
                unitPriceCents: line.unitPriceCents ? BigInt(line.unitPriceCents) : null,
                requestedDate: lineReqDate,
                promisedDate: linePromDate,
                notes: line.notes,
              },
            });
          }
        } else {
          // Default single line for backward compatibility
          await tx.orderLine.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              lineNumber: 1,
              itemId: primaryItemId,
              orderedAtoms: totalOrderedAtoms,
              requestedDate,
              promisedDate,
            },
          });
        }

        // RFQ Context
        if (input.rfqText) {
          await tx.rfqDraft.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              rawText: input.rfqText,
              sourceType: input.rfqSourceType || 'MANUAL',
            },
          });
        }

        // Initialize Engineering Revision 1
        const publishedWf = await tx.workflowVersion.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            status: 'PUBLISHED',
            template: { orderTypeId: input.orderTypeId },
          },
          orderBy: { versionNumber: 'desc' },
        });

        await tx.engineeringRevision.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: order.id,
            revisionNumber: 1,
            status: 'DRAFT',
            workflowVersionId: publishedWf?.id || null,
            outputBasisAtoms: BigInt(1_000_000), // 1 unit output basis
          },
        });

        const fullOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: {
            customer: true,
            orderType: true,
            item: true,
            lines: {
              include: {
                item: true,
                uom: true,
              },
              orderBy: { lineNumber: 'asc' },
            },
            rfqDrafts: true,
            engineeringRevisions: {
              include: { bomLines: true },
            },
          },
        });

        return {
          data: fullOrder!,
          aggregateType: 'ORDER',
          aggregateId: order.id,
          resourceVersion: order.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Add Order Line
  // -----------------------------------------------------------
  async addOrderLine(
    principal: Principal,
    orderId: string,
    input: contracts.AddOrderLineInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.line.add',
      idempotencyKey,
      payload: { orderId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
          throw new BadRequestError(`Cannot add order line to order in status '${order.status}'`);
        }

        const item = await tx.item.findFirst({
          where: { id: input.itemId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!item) throw new BadRequestError(`Item '${input.itemId}' not found or inactive`);

        if (input.uomId) {
          const uom = await tx.uom.findFirst({
            where: { id: input.uomId, workspaceId: principal.workspaceId, isActive: true },
          });
          if (!uom) throw new BadRequestError(`UOM '${input.uomId}' not found or inactive`);
        }

        const maxLine = await tx.orderLine.findFirst({
          where: { orderId: order.id, workspaceId: principal.workspaceId },
          orderBy: { lineNumber: 'desc' },
        });
        const nextLineNumber = (maxLine?.lineNumber ?? 0) + 1;
        const lineAtoms = BigInt(Math.round(input.orderedQuantity * 1_000_000));

        const orderLine = await tx.orderLine.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: order.id,
            lineNumber: nextLineNumber,
            itemId: input.itemId,
            uomId: input.uomId ?? item.baseUomId,
            orderedAtoms: lineAtoms,
            unitPriceCents: input.unitPriceCents ? BigInt(input.unitPriceCents) : null,
            requestedDate: input.requestedDate ? new Date(input.requestedDate) : order.requestedDate,
            promisedDate: input.promisedDate ? new Date(input.promisedDate) : order.promisedDate,
            notes: input.notes,
          },
          include: {
            item: true,
            uom: true,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            orderedAtoms: { increment: lineAtoms },
            version: { increment: 1 },
          },
        });

        return {
          data: orderLine,
          aggregateType: 'ORDER_LINE',
          aggregateId: orderLine.id,
          resourceVersion: 1,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Confirm Order
  // -----------------------------------------------------------
  async confirmOrder(
    principal: Principal,
    orderId: string,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.confirm',
      idempotencyKey,
      payload: { orderId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        if (order.status === 'CANCELLED') {
          throw new BadRequestError(`Cannot confirm order '${orderId}' in CANCELLED status`);
        }

        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            confirmedAt: new Date(),
            confirmedById: principal.userId,
            version: { increment: 1 },
          },
          include: {
            customer: true,
            orderType: true,
            item: true,
            lines: {
              include: {
                item: true,
                uom: true,
              },
              orderBy: { lineNumber: 'asc' },
            },
          },
        });

        return {
          data: updated,
          aggregateType: 'ORDER',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Allocate Job (Bounded Job Split)
  // -----------------------------------------------------------
  async allocateJob(
    principal: Principal,
    input: contracts.AllocateJobInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['order.create', 'order.release']);

    return executeCommand({
      principal,
      commandType: 'order.job.allocate',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const line = await tx.orderLine.findFirst({
          where: { id: input.orderLineId, workspaceId: principal.workspaceId },
          include: { order: true },
        });
        if (!line) throw new NotFoundError(`Order line '${input.orderLineId}' not found`);

        if (line.order.status === 'CANCELLED') {
          throw new BadRequestError(`Cannot allocate job for order in CANCELLED status`);
        }

        const targetAtoms = BigInt(Math.round(input.targetQuantity * 1_000_000));
        const remainingAtoms = line.orderedAtoms - line.allocatedAtoms;

        if (targetAtoms > remainingAtoms) {
          throw new BadRequestError(
            `Cannot allocate ${targetAtoms} atoms: exceeds remaining unallocated atoms (${remainingAtoms}) on order line '${line.id}'.`
          );
        }

        // Validate optional references
        if (input.departmentId) {
          const dept = await tx.department.findFirst({
            where: { id: input.departmentId, workspaceId: principal.workspaceId, archivedAt: null },
          });
          if (!dept) throw new BadRequestError(`Department '${input.departmentId}' not found or inactive`);
        }

        if (input.workflowVersionId) {
          const wf = await tx.workflowVersion.findFirst({
            where: { id: input.workflowVersionId, workspaceId: principal.workspaceId },
          });
          if (!wf) throw new BadRequestError(`Workflow version '${input.workflowVersionId}' not found`);
        }

        if (input.engineeringRevisionId) {
          const eng = await tx.engineeringRevision.findFirst({
            where: { id: input.engineeringRevisionId, workspaceId: principal.workspaceId },
          });
          if (!eng) throw new BadRequestError(`Engineering revision '${input.engineeringRevisionId}' not found`);
        }

        // Generate MO Number transaction-safely
        const moCount = await tx.manufacturingOrder.count({
          where: { workspaceId: principal.workspaceId },
        });
        const moNumber = input.moNumber || `MO-${String(moCount + 1).padStart(5, '0')}`;

        const manufacturingOrder = await tx.manufacturingOrder.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: line.orderId,
            orderLineId: line.id,
            moNumber,
            departmentId: input.departmentId ?? null,
            workflowVersionId: input.workflowVersionId ?? null,
            engineeringRevisionId: input.engineeringRevisionId ?? null,
            targetAtoms,
            status: 'RELEASED',
          },
        });

        const updatedLine = await tx.orderLine.update({
          where: { id: line.id },
          data: {
            allocatedAtoms: { increment: targetAtoms },
          },
          include: {
            item: true,
            uom: true,
            manufacturingOrders: true,
          },
        });

        return {
          data: {
            manufacturingOrder,
            orderLine: updatedLine,
            unallocatedAtoms: updatedLine.orderedAtoms - updatedLine.allocatedAtoms,
          },
          aggregateType: 'MANUFACTURING_ORDER',
          aggregateId: manufacturingOrder.id,
          resourceVersion: manufacturingOrder.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Customer Questions
  // -----------------------------------------------------------
  async addCustomerQuestion(
    principal: Principal,
    orderId: string,
    input: contracts.AddCustomerQuestionInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.read');

    return executeCommand({
      principal,
      commandType: 'order.question.add',
      idempotencyKey,
      payload: { orderId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        const q = await tx.customerQuestion.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId,
            question: input.question,
            status: 'OPEN',
          },
        });

        return {
          data: q,
          aggregateType: 'ORDER_QUESTION',
          aggregateId: q.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async resolveCustomerQuestion(
    principal: Principal,
    questionId: string,
    input: contracts.ResolveCustomerQuestionInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.question.resolve',
      idempotencyKey,
      payload: { questionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const question = await tx.customerQuestion.findFirst({
          where: { id: questionId, workspaceId: principal.workspaceId },
        });
        if (!question) throw new NotFoundError(`Question '${questionId}' not found`);

        const updated = await tx.customerQuestion.update({
          where: { id: questionId },
          data: {
            answer: input.answer,
            status: input.status,
            resolvedById: principal.userId,
            resolvedAt: new Date(),
          },
        });

        return {
          data: updated,
          aggregateType: 'ORDER_QUESTION',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }
}

export const orderService = new OrderService();
