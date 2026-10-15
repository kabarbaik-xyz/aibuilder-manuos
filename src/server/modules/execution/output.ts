import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from '../inventory/ledger';
import { MovementType, MovementReferenceType } from '../inventory/contracts';
import { z } from 'zod';

export const RecordOutputSchema = z.object({
  taskId: z.string().min(1),
  outputAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform((val) => {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'number') return BigInt(Math.floor(val));
      return BigInt(val);
    })
    .refine((val) => val > 0n, {
      message: 'Output atoms must be strictly positive (> 0)',
    }),
  destinationLocationId: z.string().min(1),
  lotNumber: z.string().trim().min(1).optional(),
  serialNumber: z.string().trim().min(1).optional(),
  isFinal: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export type RecordOutputInput = z.infer<typeof RecordOutputSchema>;

export async function recordOutput(
  db: PrismaClient,
  principal: Principal,
  rawInput: unknown,
  idempotencyKey?: string
) {
  requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'owner']);
  const input = RecordOutputSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  // 1. Fetch Task with relations
  const task = await db.task.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: input.taskId,
      },
    },
    include: {
      instance: {
        include: {
          workflowVersion: {
            include: { nodes: true },
          },
          order: {
            include: {
              demands: {
                include: { item: true },
              },
            },
          },
        },
      },
      predecessorDeps: true,
      successorDeps: true,
    },
  });

  if (!task) {
    throw new NotFoundError(`Task '${input.taskId}' not found`);
  }

  if (task.status !== 'RUNNING' && task.status !== 'READY' && task.status !== 'WAITING_QC') {
    throw new BadRequestError(
      `Cannot record output for task in status '${task.status}'. Task must be RUNNING or READY.`
    );
  }

  const order = task.instance.order;
  const targetItemId = task.targetItemId || order.itemId;

  // 2. Overproduction guard: Check total output for this task / order
  const existingOutputs = await db.productionOutput.findMany({
    where: {
      workspaceId,
      taskId: task.id,
      status: { not: 'REJECTED' },
    },
  });
  const cumulativeOutputAtoms = existingOutputs.reduce(
    (acc, o) => acc + o.outputAtoms,
    0n
  );

  const isFinalOp = task.successorDeps.length === 0 || input.isFinal;
  if (isFinalOp && cumulativeOutputAtoms + input.outputAtoms > order.orderedAtoms) {
    throw new BadRequestError(
      `Overproduction rejected: cumulative output (${cumulativeOutputAtoms + input.outputAtoms} atoms) exceeds ordered quantity (${order.orderedAtoms} atoms).`
    );
  }

  // 3. Verify destination location
  const destLocation = await db.location.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: input.destinationLocationId,
      },
    },
  });

  if (!destLocation || !destLocation.isActive || destLocation.archivedAt) {
    throw new NotFoundError(
      `Destination location '${input.destinationLocationId}' not found or inactive`
    );
  }

  // Destination for final output must be QUARANTINE (holding for QC) or FG
  const allowedKinds = ['QUARANTINE', 'FG', 'WIP'];
  if (!allowedKinds.includes(destLocation.kind)) {
    throw new BadRequestError(
      `Destination location must be QUARANTINE, FG, or WIP, but got '${destLocation.kind}'`
    );
  }

  // 4. Verify item and lot requirements
  const item = await db.item.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: targetItemId,
      },
    },
  });

  if (!item) {
    throw new NotFoundError(`Target item '${targetItemId}' not found`);
  }

  let lotId: string | null = null;
  if (item.tracking === 'LOT') {
    const lotNumber = input.lotNumber || `LOT-${order.orderNumber}-${task.nodeKey}`;
    let lot = await db.lot.findUnique({
      where: {
        workspaceId_itemId_lotNumber: {
          workspaceId,
          itemId: item.id,
          lotNumber,
        },
      },
    });

    if (!lot) {
      lot = await db.lot.create({
        data: {
          workspaceId,
          itemId: item.id,
          lotNumber,
          receivedAt: new Date(),
        },
      });
    }
    lotId = lot.id;
  }

  return executeCommand<any, any>({
    principal,
    commandType: 'production.output.record',
    idempotencyKey: idempotencyKey || randomUUID(),
    payload: input,
    prismaClient: db,
    handler: async (tx, { requestId }) => {
      const now = new Date();

      // Post physical inventory movement for the produced goods into destination location
      const movement = await postMovement(
        tx,
        principal,
        {
          movementType: MovementType.PRODUCTION_OUTPUT,
          itemId: item.id,
          sourceLocationId: null, // Production virtual boundary
          destinationLocationId: destLocation.id,
          destinationLotId: lotId,
          atoms: input.outputAtoms,
          referenceType: MovementReferenceType.TASK,
          referenceId: task.id,
          notes: input.notes || `Production output from task ${task.nodeKey}`,
        },
        requestId
      );

      // Reconcile and consume remaining WIP for this task if BOM demands exist
      const demands = order.demands.filter((d) => !d.taskId || d.taskId === task.id);
      for (const demand of demands) {
        // Find issued stock movements to WIP that haven't been consumed yet
        const wipBalances = await tx.stockBalance.findMany({
          where: {
            workspaceId,
            itemId: demand.itemId,
            location: { kind: 'WIP' },
            onHandAtoms: { gt: 0n },
          },
        });

        // Compute proportional consumption
        const proportionalRequired =
          (input.outputAtoms * demand.requiredAtoms) / (order.orderedAtoms > 0n ? order.orderedAtoms : 1n);

        let remainingToConsume = proportionalRequired;
        for (const bal of wipBalances) {
          if (remainingToConsume <= 0n) break;
          const consumeFromThis =
            bal.onHandAtoms >= remainingToConsume ? remainingToConsume : bal.onHandAtoms;

          await postMovement(
            tx,
            principal,
            {
              movementType: MovementType.PRODUCTION_CONSUME,
              itemId: demand.itemId,
              sourceLocationId: bal.locationId,
              destinationLocationId: null, // Consumed boundary
              sourceLotId: bal.lotId,
              atoms: consumeFromThis,
              referenceType: MovementReferenceType.TASK,
              referenceId: task.id,
              notes: `Consumed for output of task ${task.nodeKey}`,
            },
            requestId
          );

          remainingToConsume -= consumeFromThis;
        }
      }

      // Create ProductionOutput record
      const output = await tx.productionOutput.create({
        data: {
          workspaceId,
          taskId: task.id,
          attemptNumber: task.attemptNumber,
          itemId: item.id,
          lotId,
          outputAtoms: input.outputAtoms,
          destinationLocationId: destLocation.id,
          movementId: movement.id,
          isFinal: isFinalOp,
          status: 'RECORDED',
          operatorUserId: principal.userId,
          commandId: requestId,
          notes: input.notes,
        },
      });

      // Update Task status
      const nextStatus = isFinalOp ? 'WAITING_QC' : 'COMPLETED';
      const updatedTask = await tx.task.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: task.id,
          },
        },
        data: {
          status: nextStatus,
          completedAt: isFinalOp ? undefined : now,
          version: { increment: 1 },
        },
      });

      // If successor tasks exist and this task COMPLETED, promote successors with all predecessors completed to READY
      if (!isFinalOp) {
        const successors = await tx.taskDependency.findMany({
          where: { workspaceId, predecessorTaskId: task.id },
          include: { successor: { include: { predecessorDeps: true } } },
        });

        for (const succ of successors) {
          const allPreds = succ.successor.predecessorDeps;
          const otherPreds = allPreds.filter((p: any) => p.predecessorTaskId !== task.id);
          const otherPredTasks = await tx.task.findMany({
            where: { id: { in: otherPreds.map((p: any) => p.predecessorTaskId) } },
          });
          const allOtherCompleted = otherPredTasks.every((p: any) => p.status === 'COMPLETED');

          if (allOtherCompleted && succ.successor.status === 'PENDING') {
            await tx.task.update({
              where: { id: succ.successor.id },
              data: { status: 'READY', version: { increment: 1 } },
            });
          }
        }
      }

      // Record Workflow Event
      await tx.workflowEvent.create({
        data: {
          workspaceId,
          instanceId: task.instanceId,
          taskId: task.id,
          fromStatus: task.status,
          toStatus: nextStatus,
          action: 'OUTPUT_RECORDED',
          actorUserId: principal.userId,
          commandId: requestId,
          detailJson: JSON.stringify({
            outputId: output.id,
            outputAtoms: input.outputAtoms.toString(),
            destinationLocationId: destLocation.id,
            isFinal: isFinalOp,
          }),
        },
      });

      return {
        data: {
          output,
          movement,
          task: updatedTask,
        },
        aggregateType: 'PRODUCTION_OUTPUT',
        aggregateId: output.id,
        resourceVersion: output.version,
      };
    },
  });
}
