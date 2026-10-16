import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { NotFoundError } from '@/domain/errors';
import { SendNotificationInput, SendNotificationSchema, NotificationDTO } from './contracts';

export class NotificationService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  async sendNotification(workspaceId: string, input: SendNotificationInput) {
    const validated = SendNotificationSchema.parse(input);
    return await this.prisma.notificationInbox.create({
      data: {
        workspaceId,
        userId: validated.userId,
        title: validated.title,
        body: validated.body ?? null,
        subjectType: validated.subjectType ?? null,
        subjectId: validated.subjectId ?? null,
        metadataJson: validated.metadata ? JSON.stringify(validated.metadata) : null,
      },
    });
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
      },
    });
  }
}
