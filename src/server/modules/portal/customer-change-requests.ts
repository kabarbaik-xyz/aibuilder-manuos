import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/domain/errors';
import { CreateOrderChangeRequestInput, CreateOrderChangeRequestSchema } from '../engineering/change-contracts';

export class CustomerChangeRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Submits a customer-originated order change request (CUS-04).
   * Strict Rule: Customers cannot directly mutate order dates, BOMs, or publish schedules;
   * requests enter SUBMITTED status and require internal engineering review.
   */
  async submitChangeRequest(principal: Principal, rawInput: unknown) {
    requireAnyPermission(principal, ['customer_order.read_own', 'order.create', 'owner']);
    const input: CreateOrderChangeRequestInput = CreateOrderChangeRequestSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const order = await this.prisma.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found.`);
    }

    // Tenant / Customer isolation guard
    if (principal.customerId && order.customerId !== principal.customerId) {
      throw new ForbiddenError('You can only submit change requests for your own company orders.');
    }

    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot submit change requests for order in terminal status '${order.status}'.`);
    }

    const count = await this.prisma.orderChangeRequest.count({
      where: { workspaceId },
    });
    const requestNumber = `OCR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const record = await this.prisma.orderChangeRequest.create({
      data: {
        workspaceId,
        orderId: input.orderId,
        requestNumber,
        changeType: input.changeType,
        status: 'SUBMITTED', // Pending internal engineering review
        reason: input.reason.trim(),
        requestedChangesJson: JSON.stringify(input.requestedChanges),
        submittedAt: new Date(),
      },
    });

    return {
      id: record.id,
      requestNumber: record.requestNumber,
      orderId: record.orderId,
      changeType: record.changeType,
      status: record.status,
      reason: record.reason,
      requestedChanges: input.requestedChanges,
      submittedAt: record.submittedAt?.toISOString() || null,
    };
  }

  /**
   * Lists customer-scoped change requests for the authenticated customer principal.
   */
  async listCustomerChangeRequests(principal: Principal, orderId?: string) {
    requireAnyPermission(principal, ['customer_order.read_own', 'order.read', 'owner']);
    const workspaceId = principal.workspaceId;

    const where: any = { workspaceId };
    if (orderId) {
      where.orderId = orderId;
    }
    if (principal.customerId) {
      where.order = { customerId: principal.customerId };
    }

    const records = await this.prisma.orderChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { order: true },
    });

    return records.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      orderId: r.orderId,
      orderNumber: r.order.orderNumber,
      changeType: r.changeType,
      status: r.status,
      reason: r.reason,
      requestedChanges: JSON.parse(r.requestedChangesJson || '{}'),
      submittedAt: r.submittedAt?.toISOString() || null,
      approvedAt: r.approvedAt?.toISOString() || null,
    }));
  }
}
