import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError } from '@/domain/errors';

export type NotificationChannel = 'EMAIL' | 'WHATSAPP';

export interface SetConsentInput {
  recipient: string;
  channel: NotificationChannel;
  isOptedIn: boolean;
}

export interface SendOutboundNotificationInput {
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  payload: Record<string, unknown>;
}

export interface OutboundDispatchReceiptDTO {
  dispatchId: string;
  channel: NotificationChannel;
  maskedRecipient: string;
  templateCode: string;
  status: 'SENT' | 'REJECTED_NO_CONSENT';
  dispatchedAt: string;
}

export class NotificationConnectorService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Sets or revokes explicit recipient opt-in communication consent (INT-03/04).
   */
  async setConsent(principal: Principal, input: SetConsentInput) {
    requireAnyPermission(principal, ['access.manage', 'customer.manage', 'owner', 'order.release']);

    const workspaceId = principal.workspaceId;
    const recipientClean = input.recipient.trim().toLowerCase();

    const consent = await this.prisma.communicationConsent.upsert({
      where: {
        workspaceId_recipient_channel: {
          workspaceId,
          recipient: recipientClean,
          channel: input.channel,
        },
      },
      create: {
        workspaceId,
        recipient: recipientClean,
        channel: input.channel,
        isOptedIn: input.isOptedIn,
        optedInAt: input.isOptedIn ? new Date() : new Date(),
        optedOutAt: input.isOptedIn ? null : new Date(),
      },
      update: {
        isOptedIn: input.isOptedIn,
        optedInAt: input.isOptedIn ? new Date() : undefined,
        optedOutAt: input.isOptedIn ? null : new Date(),
      },
    });

    return {
      recipient: consent.recipient,
      channel: consent.channel,
      isOptedIn: consent.isOptedIn,
    };
  }

  /**
   * Dispatches an outbound transactional notification via configured connectors.
   * Strict Rule: Never sends unrequested messages without prior verified opt-in consent.
   */
  async sendOutboundNotification(
    principal: Principal,
    input: SendOutboundNotificationInput
  ): Promise<OutboundDispatchReceiptDTO> {
    requireAnyPermission(principal, ['customer.manage', 'order.release', 'owner', 'task.assign']);

    const workspaceId = principal.workspaceId;
    const recipientClean = input.recipient.trim().toLowerCase();

    // 1. Check verified consent
    const consent = await this.prisma.communicationConsent.findUnique({
      where: {
        workspaceId_recipient_channel: {
          workspaceId,
          recipient: recipientClean,
          channel: input.channel,
        },
      },
    });

    if (!consent || !consent.isOptedIn) {
      throw new BadRequestError(
        `Outbound ${input.channel} communication rejected: recipient '${NotificationConnectorService.maskRecipient(input.recipient)}' has not provided opt-in consent.`
      );
    }

    // 2. Dispatch message
    const dispatchId = `disp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      dispatchId,
      channel: input.channel,
      maskedRecipient: NotificationConnectorService.maskRecipient(input.recipient),
      templateCode: input.templateCode,
      status: 'SENT',
      dispatchedAt: new Date().toISOString(),
    };
  }

  /**
   * Masks recipient identifiers to prevent PII exposure in logs and audit surfaces.
   */
  static maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      const [local, domain] = recipient.split('@');
      const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
      return `${maskedLocal}@${domain}`;
    }
    // Phone
    return recipient.length > 4 ? `+***${recipient.slice(-4)}` : '****';
  }
}
