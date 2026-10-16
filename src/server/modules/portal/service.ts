import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { ForbiddenError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { db as defaultDb } from '@/server/db/client';
import { PrismaClient } from '@prisma/client';
import { PortalRepository } from './repository';
import {
  CustomerOrderSummaryDTO,
  CustomerOrderDetailDTO,
} from './contracts';

export class PortalService {
  constructor(
    private readonly repo: PortalRepository = new PortalRepository(),
    private readonly prisma: PrismaClient = defaultDb
  ) {}

  async listCustomerOrders(principal: Principal): Promise<CustomerOrderSummaryDTO[]> {
    requireAnyPermission(principal, ['customer_order.read_own', 'order.read', 'admin.access']);

    const customerId = principal.customerId;
    if (!customerId) {
      throw new ForbiddenError('Principal is not associated with a customer account');
    }

    return this.repo.listCustomerOrders(principal.workspaceId, customerId);
  }

  async getCustomerOrder(
    principal: Principal,
    orderId: string
  ): Promise<CustomerOrderDetailDTO> {
    requireAnyPermission(principal, ['customer_order.read_own', 'order.read', 'admin.access']);

    const customerId = principal.customerId;
    if (!customerId) {
      throw new ForbiddenError('Principal is not associated with a customer account');
    }

    const order = await this.repo.getCustomerOrder(
      principal.workspaceId,
      customerId,
      orderId
    );

    if (!order) {
      throw new NotFoundError(`Customer order '${orderId}' not found`);
    }

    return order;
  }

  async acknowledgePromise(
    principal: Principal,
    orderId: string,
    idempotencyKey?: string
  ): Promise<CustomerOrderDetailDTO> {
    requireAnyPermission(principal, [
      'customer_order.acknowledge_own',
      'admin.access',
    ]);

    const customerId = principal.customerId;
    if (!customerId) {
      throw new ForbiddenError('Principal is not associated with a customer account');
    }

    // Verify order exists and belongs to this customer
    const existing = await this.repo.getCustomerOrder(
      principal.workspaceId,
      customerId,
      orderId
    );
    if (!existing) {
      throw new NotFoundError(`Customer order '${orderId}' not found`);
    }

    const key = idempotencyKey || `customer-ack-${orderId}-${principal.userId || 'guest'}-${Date.now()}`;
    await executeCommand({
      principal,
      commandType: 'customer.promise.acknowledge',
      idempotencyKey: key,
      payload: { orderId, customerId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        await tx.order.updateMany({
          where: {
            id: orderId,
            workspaceId: principal.workspaceId,
            customerId,
          },
          data: {
            customerAcknowledged: true,
            customerAcknowledgedAt: new Date(),
            customerAcknowledgedBy: principal.name || 'Customer Representative',
          },
        });
        return {
          data: { orderId, customerAcknowledged: true },
          aggregateType: 'ORDER',
          aggregateId: orderId,
          resourceVersion: 1,
        };
      },
    });

    return (await this.repo.getCustomerOrder(
      principal.workspaceId,
      customerId,
      orderId
    ))!;
  }

  /**
   * Records formal customer approval for a released engineering drawing revision (CUS-02).
   */
  async approveCustomerDrawing(
    principal: Principal,
    orderId: string,
    drawingRevisionId: string,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['customer_order.acknowledge_own', 'customer_order.read_own', 'admin.access']);

    const customerId = principal.customerId;
    if (!customerId) {
      throw new ForbiddenError('Principal is not associated with a customer account');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId: principal.workspaceId, customerId },
      include: { item: true },
    });
    if (!order) {
      throw new NotFoundError(`Customer order '${orderId}' not found`);
    }

    const drawing = await this.prisma.drawingRevision.findFirst({
      where: { id: drawingRevisionId, workspaceId: principal.workspaceId, itemId: order.itemId },
    });
    if (!drawing) {
      throw new NotFoundError(`Drawing revision '${drawingRevisionId}' not found for order item`);
    }

    if (drawing.status !== 'RELEASED') {
      throw new BadRequestError(`Cannot approve drawing revision in status '${drawing.status}'. Must be RELEASED.`);
    }

    const key = idempotencyKey || `customer-drawing-ack-${orderId}-${drawingRevisionId}`;
    return executeCommand({
      principal,
      commandType: 'customer.drawing.approve',
      idempotencyKey: key,
      payload: { orderId, drawingRevisionId, drawingNumber: drawing.drawingNumber, revisionCode: drawing.revisionCode },
      prismaClient: this.prisma,
      handler: async (tx) => {
        await tx.auditEvent.create({
          data: {
            workspaceId: principal.workspaceId,
            actorUserId: principal.userId,
            action: 'customer.drawing.approved',
            aggregateType: 'DRAWING_REVISION',
            aggregateId: drawingRevisionId,
            detailJson: JSON.stringify({
              orderId,
              orderNumber: order.orderNumber,
              drawingNumber: drawing.drawingNumber,
              revisionCode: drawing.revisionCode,
              approvedBy: principal.name || 'Customer Representative',
              approvedAt: new Date().toISOString(),
            }),
          },
        });

        return {
          data: {
            orderId,
            drawingRevisionId,
            drawingNumber: drawing.drawingNumber,
            revisionCode: drawing.revisionCode,
            approvedBy: principal.name || 'Customer Representative',
            approvedAt: new Date().toISOString(),
          },
          aggregateType: 'DRAWING_REVISION',
          aggregateId: drawingRevisionId,
          resourceVersion: 1,
        };
      },
    });
  }
}
