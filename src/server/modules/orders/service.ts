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
        questions: { orderBy: { createdAt: 'asc' } },
        rfqDrafts: { orderBy: { createdAt: 'desc' } },
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

        // Item check
        const item = await tx.item.findFirst({
          where: { id: input.itemId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!item) throw new BadRequestError(`Item '${input.itemId}' not found or inactive`);

        // Generate Order Number transaction-safely
        const count = await tx.order.count({
          where: { workspaceId: principal.workspaceId },
        });
        const orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;

        const orderedAtoms = BigInt(Math.round(input.orderedQuantity * 1_000_000));
        const requestedDate = new Date(input.requestedDate);
        const promisedDate = input.promisedDate ? new Date(input.promisedDate) : null;

        const order = await tx.order.create({
          data: {
            workspaceId: principal.workspaceId,
            orderNumber,
            customerId: input.customerId,
            orderTypeId: input.orderTypeId,
            itemId: input.itemId,
            orderedAtoms,
            requestedDate,
            promisedDate,
            status: 'DRAFT',
          },
          include: {
            customer: true,
            orderType: true,
            item: true,
          },
        });

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
        // Look up if a published workflow version exists for this orderType
        const publishedWf = await tx.workflowVersion.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            status: 'PUBLISHED',
            template: { orderTypeId: input.orderTypeId },
          },
          orderBy: { versionNumber: 'desc' },
        });

        const engineeringRevision = await tx.engineeringRevision.create({
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
