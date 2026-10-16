import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission, requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import {
  IngestTelemetryInput,
  ReconcileTelemetryInput,
  TelemetryDowntimeInterval,
} from './contracts';

const DOWN_STATES = new Set(['DOWN', 'MAINTENANCE']);

/**
 * Resolves a machine the principal may see: workspace-scoped, and when the
 * machine is assigned to a facility the principal must hold that grant.
 * Cross-factory machines read as not found, mirroring execution scope.
 */
async function findAuthorizedMachine(
  db: PrismaClient,
  principal: Principal,
  machineId: string
) {
  const machine = await db.machine.findFirst({
    where: { id: machineId, workspaceId: principal.workspaceId },
  });
  if (!machine) throw new NotFoundError(`Machine '${machineId}' not found`);
  const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
  if (machine.facilityId && !facilityIds.includes(machine.facilityId)) {
    throw new NotFoundError(`Machine '${machineId}' not found`);
  }
  return machine;
}

export class TelemetryService {
  constructor(private prisma: PrismaClient) {}

  async ingestTelemetry(
    principal: Principal,
    input: IngestTelemetryInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'machine.telemetry.ingest',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        await findAuthorizedMachine(tx, principal, input.machineId);

        const ordered = [...input.events].sort(
          (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
        );
        const existingKeys = new Set<string>(
          (
            await tx.machineTelemetryEvent.findMany({
              where: { workspaceId: principal.workspaceId, machineId: input.machineId },
              select: { eventKey: true },
            })
          ).map((e: { eventKey: string }) => e.eventKey)
        );
        let lastOccurredAt = (
          await tx.machineTelemetryEvent.aggregate({
            where: { workspaceId: principal.workspaceId, machineId: input.machineId },
            _max: { occurredAt: true },
          })
        )._max.occurredAt;

        let accepted = 0;
        let duplicates = 0;
        for (const event of ordered) {
          if (existingKeys.has(event.eventKey)) {
            duplicates += 1;
            continue;
          }
          const occurredAt = new Date(event.occurredAt);
          // Late clock: an event ordered before what we already received may
          // contradict previously derived intervals; flag it for review.
          const late = lastOccurredAt !== null && occurredAt < lastOccurredAt;
          await tx.machineTelemetryEvent.create({
            data: {
              workspaceId: principal.workspaceId,
              machineId: input.machineId,
              eventKey: event.eventKey,
              state: event.state,
              occurredAt,
              payloadJson: event.payloadJson ?? '{}',
              needsReconciliation: late,
            },
          });
          existingKeys.add(event.eventKey);
          if (!late) lastOccurredAt = occurredAt;
          accepted += 1;
        }

        return {
          data: { accepted, duplicates },
          aggregateType: 'MACHINE_TELEMETRY',
          aggregateId: input.machineId,
          resourceVersion: accepted,
        };
      },
    });
  }

  async listTelemetryEvents(principal: Principal, machineId: string, limit = 100) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read', 'admin.access']);
    await findAuthorizedMachine(this.prisma, principal, machineId);
    const events = await this.prisma.machineTelemetryEvent.findMany({
      where: { workspaceId: principal.workspaceId, machineId },
      orderBy: [{ occurredAt: 'asc' }],
      take: Math.min(Math.max(limit, 1), 500),
    });
    return { data: events };
  }

  async listDowntimeIntervals(principal: Principal, machineId: string) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read', 'admin.access']);
    await findAuthorizedMachine(this.prisma, principal, machineId);
    const events = await this.prisma.machineTelemetryEvent.findMany({
      where: { workspaceId: principal.workspaceId, machineId },
      orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }],
      select: { eventKey: true, state: true, occurredAt: true },
    });

    const intervals: TelemetryDowntimeInterval[] = [];
    let open: TelemetryDowntimeInterval | null = null;
    for (const event of events) {
      const isDown = DOWN_STATES.has(event.state);
      if (isDown && !open) {
        open = { startAt: event.occurredAt, endAt: null, sourceEventKeys: [event.eventKey] };
        intervals.push(open);
      } else if (isDown && open) {
        open.sourceEventKeys.push(event.eventKey);
      } else if (!isDown && open) {
        open.endAt = event.occurredAt;
        open = null;
      }
    }
    return { data: intervals };
  }

  async reconcileEvent(
    principal: Principal,
    input: ReconcileTelemetryInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'resource.manage');

    return executeCommand({
      principal,
      commandType: 'machine.telemetry.reconcile',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const event = await tx.machineTelemetryEvent.findFirst({
          where: { id: input.eventId, workspaceId: principal.workspaceId },
        });
        if (!event) throw new NotFoundError(`Telemetry event '${input.eventId}' not found`);
        if (!event.needsReconciliation) {
          throw new BadRequestError('Telemetry event does not require reconciliation');
        }
        const updated = await tx.machineTelemetryEvent.update({
          where: { id: event.id },
          data: {
            needsReconciliation: false,
            reconciliationNote: input.note,
            reconciledAt: new Date(),
            reconciledById: principal.userId,
          },
        });
        return {
          data: updated,
          aggregateType: 'MACHINE_TELEMETRY',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }
}
