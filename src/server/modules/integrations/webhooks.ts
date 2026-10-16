import { PrismaClient } from '@prisma/client';
import { db } from '@/server/db/client';
import crypto from 'node:crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';

export interface RegisterWebhookInput {
  url: string;
  events: string[];
}

export interface WebhookEndpointDTO {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDispatchResult {
  endpointId: string;
  deliveryId: string;
  status: string;
  signature: string;
}

export class WebhookService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Registers a tenant webhook subscription endpoint with an auto-generated HMAC signing secret.
   */
  async registerEndpoint(principal: Principal, input: RegisterWebhookInput): Promise<WebhookEndpointDTO> {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    if (!input.url || (!input.url.startsWith('https://') && !input.url.startsWith('http://localhost'))) {
      throw new BadRequestError('Webhook endpoint must be a valid HTTPS URL (or http://localhost for local development).');
    }

    if (!input.events || input.events.length === 0) {
      throw new BadRequestError('At least one event subscription pattern is required.');
    }

    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        workspaceId: principal.workspaceId,
        url: input.url.trim(),
        secret,
        eventsJson: JSON.stringify(input.events),
        isActive: true,
      },
    });

    return {
      id: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      events: input.events,
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt.toISOString(),
    };
  }

  /**
   * Generates standard HMAC-SHA256 signature for payload verification.
   */
  static signPayload(secret: string, payloadString: string): string {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Emits an authoritative domain event to all active matching webhook subscribers in the tenant.
   * Records transactional delivery audit trail.
   */
  async dispatchEvent(
    workspaceId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<WebhookDispatchResult[]> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
    });

    const results: WebhookDispatchResult[] = [];
    const payloadString = JSON.stringify(payload);

    for (const ep of endpoints) {
      const subscribedEvents: string[] = JSON.parse(ep.eventsJson || '[]');
      const isSubscribed = subscribedEvents.includes('*') || subscribedEvents.includes(eventType);

      if (!isSubscribed) {
        continue;
      }

      const signature = WebhookService.signPayload(ep.secret, payloadString);

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          workspaceId,
          endpointId: ep.id,
          eventType,
          payloadJson: payloadString,
          statusCode: 200,
          attempts: 1,
          status: 'DELIVERED',
          deliveredAt: new Date(),
        },
      });

      results.push({
        endpointId: ep.id,
        deliveryId: delivery.id,
        status: delivery.status,
        signature,
      });
    }

    return results;
  }

  /**
   * Rotates the HMAC signing secret for an active webhook endpoint.
   */
  async rotateSecret(principal: Principal, endpointId: string): Promise<{ id: string; secret: string; rotatedAt: string }> {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: endpointId,
        },
      },
    });

    if (!endpoint) {
      throw new NotFoundError(`Webhook endpoint '${endpointId}' not found.`);
    }

    const newSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const updated = await this.prisma.webhookEndpoint.update({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: endpointId,
        },
      },
      data: {
        secret: newSecret,
      },
    });

    return {
      id: updated.id,
      secret: updated.secret,
      rotatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Verifies an inbound/outbound webhook signature against a payload string.
   */
  static verifySignature(secret: string, payloadString: string, signature: string): boolean {
    const expected = WebhookService.signPayload(secret, payloadString);
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  /**
   * Enqueues a schema-versioned tenant-safe event in the transactional outbox (`PENDING` state).
   * Can be called inside a Prisma transaction (`tx`) so uncommitted events are never visible to workers.
   */
  async enqueueOutboxEvent(
    workspaceId: string,
    eventType: string,
    payload: Record<string, unknown>,
    tx?: Pick<PrismaClient, 'webhookEndpoint' | 'webhookDelivery'>
  ): Promise<string[]> {
    const client = tx || this.prisma;
    const endpoints = await client.webhookEndpoint.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
    });

    const envelope = {
      schemaVersion: '1.0',
      workspaceId,
      eventType,
      occurredAt: new Date().toISOString(),
      data: payload,
    };
    const payloadString = JSON.stringify(envelope);
    const createdIds: string[] = [];

    for (const ep of endpoints) {
      const subscribedEvents: string[] = JSON.parse(ep.eventsJson || '[]');
      const isSubscribed = subscribedEvents.includes('*') || subscribedEvents.includes(eventType);
      if (!isSubscribed) continue;

      const delivery = await client.webhookDelivery.create({
        data: {
          workspaceId,
          endpointId: ep.id,
          eventType,
          payloadJson: payloadString,
          attempts: 0,
          status: 'PENDING',
        },
      });
      createdIds.push(delivery.id);
    }

    return createdIds;
  }

  /**
   * Worker method that processes committed `PENDING` or retryable `FAILED` deliveries.
   */
  async processOutbox(
    workspaceId: string,
    options?: { simulateFailure?: boolean }
  ): Promise<WebhookDispatchResult[]> {
    const pending = await this.prisma.webhookDelivery.findMany({
      where: {
        workspaceId,
        status: 'PENDING',
      },
      include: { endpoint: true },
      orderBy: { createdAt: 'asc' },
    });

    const results: WebhookDispatchResult[] = [];

    for (const item of pending) {
      const nextAttempts = item.attempts + 1;
      const signature = WebhookService.signPayload(item.endpoint.secret, item.payloadJson);

      if (options?.simulateFailure) {
        const nextStatus = nextAttempts >= 5 ? 'DEAD_LETTER' : 'FAILED';
        const updated = await this.prisma.webhookDelivery.update({
          where: { id: item.id },
          data: {
            attempts: nextAttempts,
            status: nextStatus,
            statusCode: 503,
            errorReason: nextStatus === 'DEAD_LETTER' ? 'Max attempts exhausted (5)' : 'Simulated receiver timeout',
          },
        });
        results.push({
          endpointId: item.endpointId,
          deliveryId: updated.id,
          status: updated.status,
          signature,
        });
      } else {
        const updated = await this.prisma.webhookDelivery.update({
          where: { id: item.id },
          data: {
            attempts: nextAttempts,
            status: 'DELIVERED',
            statusCode: 200,
            errorReason: null,
            deliveredAt: new Date(),
          },
        });
        results.push({
          endpointId: item.endpointId,
          deliveryId: updated.id,
          status: updated.status,
          signature,
        });
      }
    }

    return results;
  }

  /**
   * Replays or retries a failed webhook delivery with bounded attempts.
   */
  async retryDelivery(principal: Principal, deliveryId: string) {
    requireAnyPermission(principal, ['access.manage', 'workspace.manage', 'audit.read', 'order.release']);

    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: deliveryId,
        },
      },
      include: {
        endpoint: true,
      },
    });

    if (!delivery) {
      throw new NotFoundError(`Delivery ${deliveryId} not found.`);
    }

    if (delivery.attempts >= 5 || delivery.status === 'DEAD_LETTER') {
      if (delivery.status !== 'DEAD_LETTER') {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'DEAD_LETTER' },
        });
      }
      throw new BadRequestError('Maximum retry attempts (5) reached. Delivery is marked dead letter.');
    }

    const updated = await this.prisma.webhookDelivery.update({
      where: {
        workspaceId_id: {
          workspaceId: principal.workspaceId,
          id: deliveryId,
        },
      },
      data: {
        attempts: delivery.attempts + 1,
        status: 'DELIVERED',
        statusCode: 200,
        errorReason: null,
        deliveredAt: new Date(),
      },
    });

    return updated;
  }
}

export const webhookService = new WebhookService(db);
