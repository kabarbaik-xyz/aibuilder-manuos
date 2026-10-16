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
  payload: Record<string, any>;
}

export interface OfflineSyncItemDTO {
  id: string;
  commandType: string;
  idempotencyKey: string;
  status: 'QUEUED' | 'APPLIED' | 'CONFLICT' | 'FAILED';
  errorReason: string | null;
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
      return {
        id: existing.id,
        commandType: existing.commandType,
        idempotencyKey: existing.idempotencyKey,
        status: existing.status as any,
        errorReason: existing.errorReason,
        appliedAt: existing.appliedAt?.toISOString() || null,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    const created = await this.prisma.offlineSyncQueue.create({
      data: {
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        payloadJson: JSON.stringify(input.payload),
        status: 'QUEUED',
      },
    });

    return {
      id: created.id,
      commandType: created.commandType,
      idempotencyKey: created.idempotencyKey,
      status: created.status as any,
      errorReason: null,
      appliedAt: null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Replays and settles pending offline commands in strict chronological sequence.
   * Detects server-side conflicts (e.g., superseded task state) without dropping the audit trail.
   */
  async processPendingQueue(principal: Principal): Promise<OfflineSyncItemDTO[]> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write', 'order.release']);

    const queued = await this.prisma.offlineSyncQueue.findMany({
      where: {
        workspaceId: principal.workspaceId,
        status: 'QUEUED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const results: OfflineSyncItemDTO[] = [];

    for (const item of queued) {
      const payload = JSON.parse(item.payloadJson || '{}');

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

          if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
            const conflictUpdate = await this.prisma.offlineSyncQueue.update({
              where: { id: item.id },
              data: {
                status: 'CONFLICT',
                errorReason: `Cannot start task: current status is ${task.status}`,
              },
            });
            results.push({
              id: conflictUpdate.id,
              commandType: conflictUpdate.commandType,
              idempotencyKey: conflictUpdate.idempotencyKey,
              status: 'CONFLICT',
              errorReason: conflictUpdate.errorReason,
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
          appliedAt: updated.appliedAt?.toISOString() || null,
          createdAt: updated.createdAt.toISOString(),
        });
      } catch (err: any) {
        const isConflict =
          err.message?.includes('already') ||
          err.message?.includes('status') ||
          err.message?.includes('in progress');

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
          appliedAt: null,
          createdAt: updated.createdAt.toISOString(),
        });
      }
    }

    return results;
  }
}
