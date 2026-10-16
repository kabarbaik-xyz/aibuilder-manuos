import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { ExecutionService } from './service';
import { recordOutput } from './output';

export const ALLOWED_OFFLINE_COMMANDS = [
  'START_TASK',
  'RECORD_OUTPUT',
  'SCAN_CODE',
] as const;

export type AllowedOfflineCommandType = typeof ALLOWED_OFFLINE_COMMANDS[number];

export interface EnqueueOfflineCommandInput {
  commandType: AllowedOfflineCommandType;
  idempotencyKey: string;
  occurredAt?: string;
  payload: Record<string, any>;
}

export interface OfflineSyncItemDTO {
  id: string;
  commandType: string;
  idempotencyKey: string;
  status: 'QUEUED' | 'APPLIED' | 'CONFLICT' | 'FAILED';
  errorReason: string | null;
  occurredAt: string;
  appliedAt: string | null;
  createdAt: string;
}

export class OfflineSyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly executionService: ExecutionService
  ) {}

  /**
   * Enqueues an offline-originated execution command with a stable client idempotency key.
   */
  async enqueueCommand(
    principal: Principal,
    input: EnqueueOfflineCommandInput
  ): Promise<OfflineSyncItemDTO> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);

    if (!ALLOWED_OFFLINE_COMMANDS.includes(input.commandType)) {
      throw new BadRequestError(
        `Command type '${input.commandType}' is not permitted for offline execution. Allowed commands: ${ALLOWED_OFFLINE_COMMANDS.join(', ')}`
      );
    }

    if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
      throw new BadRequestError('Idempotency key is required for offline sync reliability.');
    }

    // Check if key already exists
    const existing = await this.prisma.offlineSyncQueue.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: principal.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      if (existing.userId !== principal.userId) {
        throw new BadRequestError('Offline sync idempotency key belongs to a different user session.');
      }
      const parsedPayload = JSON.parse(existing.payloadJson || '{}');
      return {
        id: existing.id,
        commandType: existing.commandType,
        idempotencyKey: existing.idempotencyKey,
        status: existing.status as any,
        errorReason: existing.errorReason,
        occurredAt: parsedPayload.__occurredAt || existing.createdAt.toISOString(),
        appliedAt: existing.appliedAt?.toISOString() || null,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    const occurredAtIso = input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString();

    const storedPayload = {
      ...input.payload,
      __occurredAt: occurredAtIso,
    };

    const created = await this.prisma.offlineSyncQueue.create({
      data: {
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        payloadJson: JSON.stringify(storedPayload),
        status: 'QUEUED',
      },
    });

    return {
      id: created.id,
      commandType: created.commandType,
      idempotencyKey: created.idempotencyKey,
      status: created.status as any,
      errorReason: null,
      occurredAt: occurredAtIso,
      appliedAt: null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Replays and settles pending offline commands in strict chronological sequence.
   * Scoped to the authenticated user's queued items unless supervisor/owner processes workspace queue.
   * Detects server-side conflicts (e.g., superseded task state or stale version) without dropping the audit trail.
   */
  async processPendingQueue(
    principal: Principal,
    options?: { userId?: string }
  ): Promise<OfflineSyncItemDTO[]> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write', 'order.release']);

    const targetUserId = options?.userId ?? principal.userId;
    if (
      targetUserId !== principal.userId &&
      !principal.permissions.has('task.assign') &&
      !principal.permissions.has('owner')
    ) {
      throw new BadRequestError('Cannot replay offline queue belonging to another user without supervisor authority.');
    }

    const queued = await this.prisma.offlineSyncQueue.findMany({
      where: {
        workspaceId: principal.workspaceId,
        userId: targetUserId,
        status: 'QUEUED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const results: OfflineSyncItemDTO[] = [];

    for (const item of queued) {
      const rawPayload = JSON.parse(item.payloadJson || '{}');
      const { __occurredAt, ...payload } = rawPayload;
      const occurredAt = __occurredAt || item.createdAt.toISOString();

      try {
        if (item.commandType === 'START_TASK') {
          const task = await this.prisma.task.findUnique({
            where: {
              workspaceId_id: {
                workspaceId: principal.workspaceId,
                id: payload.taskId,
              },
            },
          });

          if (!task) {
            throw new NotFoundError(`Task ${payload.taskId} not found.`);
          }

          if (
            task.status === 'COMPLETED' ||
            task.status === 'CANCELLED' ||
            (payload.expectedVersion !== undefined && task.version !== payload.expectedVersion)
          ) {
            const reason =
              payload.expectedVersion !== undefined && task.version !== payload.expectedVersion
                ? `Stale task version: expected ${payload.expectedVersion}, current ${task.version}`
                : `Cannot start task: current status is ${task.status}`;

            const conflictUpdate = await this.prisma.offlineSyncQueue.update({
              where: { id: item.id },
              data: {
                status: 'CONFLICT',
                errorReason: reason,
              },
            });
            results.push({
              id: conflictUpdate.id,
              commandType: conflictUpdate.commandType,
              idempotencyKey: conflictUpdate.idempotencyKey,
              status: 'CONFLICT',
              errorReason: conflictUpdate.errorReason,
              occurredAt,
              appliedAt: null,
              createdAt: conflictUpdate.createdAt.toISOString(),
            });
            continue;
          }

          await this.executionService.startTask(principal, payload, item.idempotencyKey);
        } else if (item.commandType === 'RECORD_OUTPUT') {
          await recordOutput(this.prisma, principal, payload, item.idempotencyKey);
        } else if (item.commandType === 'SCAN_CODE') {
          await this.executionService.scanCode(principal, payload);
        }

        const updated = await this.prisma.offlineSyncQueue.update({
          where: { id: item.id },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            errorReason: null,
          },
        });

        results.push({
          id: updated.id,
          commandType: updated.commandType,
          idempotencyKey: updated.idempotencyKey,
          status: 'APPLIED',
          errorReason: null,
          occurredAt,
          appliedAt: updated.appliedAt?.toISOString() || null,
          createdAt: updated.createdAt.toISOString(),
        });
      } catch (err: any) {
        const isConflict =
          err.message?.includes('already') ||
          err.message?.includes('status') ||
          err.message?.includes('in progress') ||
          err.message?.includes('assigned');

        const updated = await this.prisma.offlineSyncQueue.update({
          where: { id: item.id },
          data: {
            status: isConflict ? 'CONFLICT' : 'FAILED',
            errorReason: err.message || 'Unknown processing error',
          },
        });

        results.push({
          id: updated.id,
          commandType: updated.commandType,
          idempotencyKey: updated.idempotencyKey,
          status: isConflict ? 'CONFLICT' : 'FAILED',
          errorReason: updated.errorReason,
          occurredAt,
          appliedAt: null,
          createdAt: updated.createdAt.toISOString(),
        });
      }
    }

    return results;
  }
}
