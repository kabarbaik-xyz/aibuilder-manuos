import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { ForbiddenError, NotFoundError } from '@/domain/errors';
import { PortalRepository } from './repository';
import {
  CustomerOrderSummaryDTO,
  CustomerOrderDetailDTO,
} from './contracts';

export class PortalService {
  constructor(private readonly repo: PortalRepository = new PortalRepository()) {}

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
    orderId: string
  ): Promise<CustomerOrderDetailDTO> {
    requireAnyPermission(principal, [
      'customer_order.acknowledge_own',
      'customer_order.read_own',
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

    await this.repo.acknowledgePromise(
      principal.workspaceId,
      customerId,
      orderId,
      principal.name || 'Customer Representative'
    );

    return (await this.repo.getCustomerOrder(
      principal.workspaceId,
      customerId,
      orderId
    ))!;
  }
}
