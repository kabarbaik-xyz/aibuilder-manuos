import { Prisma, PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { SendNotificationInput, SendNotificationSchema, NotificationDTO, NotificationPreferencesSchema, UpdateNotificationPreferencesSchema } from './contracts';

export class NotificationService {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient = defaultDb) {}

  async notifyFacilityMembers(workspaceId: string, facilityId: string | null, permission: string, input: Omit<SendNotificationInput, 'userId'>) {
    if (!facilityId) return;
    const recipients = await this.prisma.membership.findMany({
      where: {
        workspaceId, status: 'ACTIVE', customerId: null,
        OR: [{ facilityId }, { facilityGrants: { some: { facilityId, workspaceId } } }],
        roles: { some: { role: { permissions: { some: { permissionCode: permission } } } } },
      },
      select: { userId: true },
    });
    for (const recipient of recipients) {
      await this.sendNotification(workspaceId, { ...input, facilityId, userId: recipient.userId });
    }
  }

  async sendNotification(workspaceId: string, input: SendNotificationInput) {
    const validated = SendNotificationSchema.parse(input);
    try {
    const recipient = await this.prisma.membership.findFirst({
      where: {
        workspaceId, userId: validated.userId, status: 'ACTIVE',
        ...(validated.facilityId ? { OR: [{ facilityId: validated.facilityId }, { facilityGrants: { some: { facilityId: validated.facilityId, workspaceId } } }] } : {}),
      },
      select: { id: true, notificationPreferencesJson: true },
    });
    if (!recipient) {
      throw new NotFoundError(`Notification recipient '${validated.userId}' is not a member of workspace '${workspaceId}'`);
    }
    const preferences = NotificationPreferencesSchema.parse(JSON.parse(recipient.notificationPreferencesJson));
    const enabled = preferences[validated.category];
    const data = {
        workspaceId,
        userId: validated.userId,
        title: validated.title,
        category: validated.category,
        status: enabled ? 'UNREAD' : 'ARCHIVED',
        deliveryStatus: enabled ? 'DELIVERED' : 'SUPPRESSED',
        deliveryReason: enabled ? null : 'PREFERENCE_DISABLED',
        body: validated.body ?? null,
        subjectType: validated.subjectType ?? null,
        subjectId: validated.subjectId ?? null,
        dedupeKey: validated.dedupeKey ?? null,
        metadataJson: validated.metadata ? JSON.stringify(validated.metadata) : null,
      };
    if (!validated.dedupeKey) return await this.prisma.notificationInbox.create({ data });

    return await this.prisma.notificationInbox.upsert({
      where: {
        workspaceId_userId_dedupeKey: {
          workspaceId,
          userId: validated.userId,
          dedupeKey: validated.dedupeKey,
        },
      },
      create: data,
      update: {},
    });
    } catch (error) {
      // Keep failure evidence outside the failing transaction; never commit a
      // business command while silently dropping its mandatory notification.
      console.error(JSON.stringify({
        event: 'notification.delivery_failed', workspaceId,
        recipientUserId: validated.userId, category: validated.category,
        dedupeKey: validated.dedupeKey ?? null,
        errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'NOTIFICATION_REJECTED',
      }));
      throw error;
    }
  }

  async getPreferences(principal: Principal) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: principal.membershipId, workspaceId: principal.workspaceId, userId: principal.userId, status: 'ACTIVE' },
      select: { notificationPreferencesJson: true, version: true },
    });
    if (!membership) throw new NotFoundError('Active membership not found');
    return { preferences: NotificationPreferencesSchema.parse(JSON.parse(membership.notificationPreferencesJson)), version: membership.version };
  }

  async updatePreferences(principal: Principal, rawInput: unknown, idempotencyKey: string) {
    const input = UpdateNotificationPreferencesSchema.parse(rawInput);
    const client = this.prisma;
    if (!('$transaction' in client)) throw new BadRequestError('Preferences require their own command transaction');
    return executeCommand({
      principal, commandType: 'notification.preferences.update', idempotencyKey,
      expectedVersion: input.expectedVersion, payload: input, prismaClient: client,
      handler: async (tx) => {
        const membership = await tx.membership.findFirst({
          where: { id: principal.membershipId, workspaceId: principal.workspaceId, userId: principal.userId, status: 'ACTIVE' },
        });
        if (!membership) throw new NotFoundError('Active membership not found');
        const updated = await tx.membership.update({
          where: { id: membership.id },
          data: { notificationPreferencesJson: JSON.stringify(input.preferences), version: { increment: 1 } },
        });
        return { data: { preferences: input.preferences, version: updated.version }, aggregateType: 'MEMBERSHIP', aggregateId: membership.id, previousVersion: membership.version, resourceVersion: updated.version };
      },
    });
  }

  async getDeliverySummary(principal: Principal) {
    const where = { workspaceId: principal.workspaceId, userId: principal.userId };
    const [delivered, suppressed] = await Promise.all([
      this.prisma.notificationInbox.count({ where: { ...where, deliveryStatus: 'DELIVERED' } }),
      this.prisma.notificationInbox.count({ where: { ...where, deliveryStatus: 'SUPPRESSED' } }),
    ]);
    return { delivered, suppressed };
  }

  async listNotifications(
    principal: Principal,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
  ): Promise<NotificationDTO[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const where: any = {
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      deliveryStatus: 'DELIVERED',
    };
    if (options.unreadOnly) {
      where.status = 'UNREAD';
    }

    const items = await this.prisma.notificationInbox.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return items.map((n) => ({
      id: n.id,
      workspaceId: n.workspaceId,
      userId: n.userId,
      title: n.title,
      body: n.body,
      status: n.status as 'UNREAD' | 'READ' | 'ARCHIVED',
      category: n.category,
      deliveryStatus: n.deliveryStatus,
      deliveryReason: n.deliveryReason,
      subjectType: n.subjectType,
      subjectId: n.subjectId,
      metadataJson: n.metadataJson,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markAsRead(principal: Principal, notificationId: string) {
    const notification = await this.prisma.notificationInbox.findFirst({
      where: {
        id: notificationId,
        workspaceId: principal.workspaceId,
        userId: principal.userId,
      },
    });
    if (!notification) {
      throw new NotFoundError(`Notification '${notificationId}' not found`);
    }

    return await this.prisma.notificationInbox.update({
      where: { id: notificationId },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(principal: Principal) {
    const now = new Date();
    return await this.prisma.notificationInbox.updateMany({
      where: {
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        status: 'UNREAD',
        deliveryStatus: 'DELIVERED',
      },
      data: {
        status: 'READ',
        readAt: now,
      },
    });
  }

  async getUnreadCount(principal: Principal): Promise<number> {
    return await this.prisma.notificationInbox.count({
      where: {
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        status: 'UNREAD',
        deliveryStatus: 'DELIVERED',
      },
    });
  }
}
