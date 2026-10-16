import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { PublishScheduleSchema } from '../engineering/change-contracts';

export class PublishedScheduleService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Publishes an official versioned master schedule revision (SCH-06).
   * Takes an authoritative snapshot of confirmed bookings and assigned tasks.
   */
  async publishSchedule(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['planning.write', 'order.release']);
    const input = PublishScheduleSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'planning.schedule.publish',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const start = new Date(input.periodStart);
        const end = new Date(input.periodEnd);
        if (start >= end) {
          throw new BadRequestError('Schedule period start must precede period end');
        }

        // Fetch bookings inside period to snapshot
        const bookings = await tx.resourceBooking.findMany({
          where: {
            workspaceId,
            status: 'CONFIRMED',
            startAt: { gte: start },
            endAt: { lte: end },
          },
          include: {
            task: { select: { id: true, nodeKey: true, instanceId: true } },
          },
        });

        // Supersede earlier published schedules covering the same period
        await tx.publishedSchedule.updateMany({
          where: {
            workspaceId,
            status: 'PUBLISHED',
            periodStart: start,
            periodEnd: end,
          },
          data: { status: 'SUPERSEDED' },
        });

        const count = await tx.publishedSchedule.count({ where: { workspaceId } });
        const revisionNumber = count + 1;

        const schedule = await tx.publishedSchedule.create({
          data: {
            workspaceId,
            revisionNumber,
            title: input.title,
            periodStart: start,
            periodEnd: end,
            status: 'PUBLISHED',
            snapshotJson: JSON.stringify({
              publishedAt: new Date().toISOString(),
              bookingsCount: bookings.length,
              bookings,
            }),
            publishedByUserId: principal.userId,
          },
        });

        return {
          data: schedule,
          aggregateType: 'PUBLISHED_SCHEDULE',
          aggregateId: schedule.id,
          resourceVersion: revisionNumber,
        };
      },
    });
  }

  /**
   * Retrieves schedule publication history.
   */
  async getPublishedSchedules(principal: Principal) {
    requireAnyPermission(principal, ['planning.read', 'order.read']);
    return this.db.publishedSchedule.findMany({
      where: { workspaceId: principal.workspaceId },
      orderBy: { revisionNumber: 'desc' },
    });
  }
}

import { db } from "@/server/db/client";
export const publishedScheduleService = new PublishedScheduleService(db);
