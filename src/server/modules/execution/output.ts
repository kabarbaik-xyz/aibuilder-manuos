import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission, hasPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from '../inventory/ledger';
import { MovementType, MovementReferenceType } from '../inventory/contracts';
import { assertRequiredFormsFinalized } from '../forms/completion';
import { parseAtomInput } from '@/domain/quantity';
import { z } from 'zod';

export const RecordOutputSchema = z.object({
  taskId: z.string().min(1),
  outputAtoms: z
    .union([z.bigint(), z.string(), z.number()])
    .transform(parseAtomInput)
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
  requireAnyPermission(principal, ['task.execute_assigned', 'task.assign']);
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

  // Assignment ownership check
  const isSupervisor =
    hasPermission(principal, 'task.assign') ||
    hasPermission(principal, 'planning.write') ||
    hasPermission(principal, 'workspace.admin') ||
    hasPermission(principal, 'owner');

  if (
    !isSupervisor &&
    task.assignedTechnicianId &&
    (!principal.technicianId || task.assignedTechnicianId !== principal.technicianId)
  ) {
    throw new ForbiddenError(
      `Cannot record output for task '${task.nodeKey}': task is assigned to another technician.`
    );
  }

  if (task.status !== 'RUNNING' && task.status !== 'READY' && task.status !== 'WAITING_QC') {
    throw new BadRequestError(
      `Cannot record output for task in status '${task.status}'. Task must be RUNNING or READY.`
    );
  }

  const order = task.instance.order;
  const targetItemId = task.targetItemId || order.itemId;

  // 2. Verify destination location
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

  // 3. Verify item and lot requirements
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

      // Re-read task and existing outputs inside the transaction
      const currentTask = await tx.task.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.taskId } },
        include: {
          successorDeps: true,
          jobsheet: { include: { manufacturingOrder: true } },
        },
      });
      if (!currentTask) {
        throw new NotFoundError(`Task '${input.taskId}' not found`);
      }
      if (
        currentTask.status !== 'RUNNING' &&
        currentTask.status !== 'READY' &&
        currentTask.status !== 'WAITING_QC'
      ) {
        throw new BadRequestError(
          `Cannot record output for task in status '${currentTask.status}'. Task must be RUNNING or READY.`
        );
      }

      const taskOutputs = await tx.productionOutput.findMany({
        where: {
          workspaceId,
          taskId: currentTask.id,
          attemptNumber: currentTask.attemptNumber,
          status: { not: 'REJECTED' },
        },
        select: { outputAtoms: true },
      });
      const priorTaskOutputAtoms = taskOutputs.reduce(
        (total: bigint, output: { outputAtoms: bigint }) => total + output.outputAtoms,
        0n
      );
      const isFinalOp = currentTask.successorDeps.length === 0 || input.isFinal;
      const currentOrder = await tx.order.findUnique({
        where: { workspaceId_id: { workspaceId, id: order.id } },
        include: { lines: true },
      });
      if (!currentOrder) throw new NotFoundError(`Order '${order.id}' not found`);
      const matchingLines = currentOrder.lines.filter((line: { itemId: string; orderedAtoms: bigint }) => line.itemId === targetItemId);
      const orderedForItem = matchingLines.length
        ? matchingLines.reduce((total: bigint, line: { orderedAtoms: bigint }) => total + line.orderedAtoms, 0n)
        : targetItemId === currentOrder.itemId
          ? currentOrder.orderedAtoms
          : 0n;
      if (orderedForItem <= 0n) {
        throw new BadRequestError(`Output item '${targetItemId}' is not part of order '${currentOrder.id}'.`);
      }
      const taskTargetAtoms = currentTask.targetAtoms > 0n
        ? currentTask.targetAtoms
        : currentTask.jobsheet?.manufacturingOrder?.targetAtoms ?? orderedForItem;
      const nextTaskOutputAtoms = priorTaskOutputAtoms + input.outputAtoms;
      if (nextTaskOutputAtoms > taskTargetAtoms) {
        throw new BadRequestError(
          `Overproduction rejected: task '${currentTask.nodeKey}' would reach ${nextTaskOutputAtoms} atoms, above its target of ${taskTargetAtoms} atoms.`
        );
      }
      const taskOutputComplete = nextTaskOutputAtoms === taskTargetAtoms;

      const existingOutputs = await tx.productionOutput.findMany({
        where: {
          workspaceId,
          itemId: targetItemId,
          isFinal: true,
          status: { not: 'REJECTED' },
          task: { instance: { orderId: order.id } },
        },
      });
      if (isFinalOp) {
        const finalOutputAtoms = existingOutputs.reduce(
          (total: bigint, output: { outputAtoms: bigint }) => total + output.outputAtoms,
          0n
        );
        if (finalOutputAtoms + input.outputAtoms > orderedForItem) {
          throw new BadRequestError(
            `Overproduction rejected: final output for item '${targetItemId}' (${finalOutputAtoms + input.outputAtoms} atoms) exceeds ordered quantity (${orderedForItem} atoms).`
          );
        }
      }

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
          referenceId: currentTask.id,
          notes: input.notes || `Production output from task ${currentTask.nodeKey}`,
        },
        requestId
      );

      // Reconcile and consume remaining WIP for this task if BOM demands exist
      const unassignedDemands = order.demands.filter((d) => !d.taskId);
      if (unassignedDemands.length > 0) {
        const taskCount = await tx.task.count({ where: { workspaceId, instanceId: currentTask.instanceId } });
        if (taskCount > 1) {
          throw new BadRequestError(
            `Order contains ${unassignedDemands.length} material demand(s) without an operation assignment. Bind each BOM line to a workflow operation before recording multi-step output.`
          );
        }
      }
      const demands = order.demands.filter((d) => d.taskId === currentTask.id || (!d.taskId && unassignedDemands.length > 0));
      for (const demand of demands) {
        const wipBalances = await tx.stockBalance.findMany({
          where: {
            workspaceId,
            itemId: demand.itemId,
            location: { kind: 'WIP' },
            onHandAtoms: { gt: 0n },
          },
        });

        // Compute proportional consumption
        const consumedBefore = (priorTaskOutputAtoms * demand.requiredAtoms) / taskTargetAtoms;
        const consumedAfter = (nextTaskOutputAtoms * demand.requiredAtoms) / taskTargetAtoms;
        const proportionalRequired = consumedAfter - consumedBefore;

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
              referenceId: currentTask.id,
              notes: `Consumed for output of task ${currentTask.nodeKey}`,
            },
            requestId
          );

          remainingToConsume -= consumeFromThis;
        }

        // Hard gate: reject unsatisfied required consumption
        if (demand.requiredAtoms > 0n && remainingToConsume > 0n) {
          throw new BadRequestError(
            `Insufficient WIP inventory for required item '${demand.item?.name || demand.itemId}': required ${proportionalRequired} atoms, but only ${proportionalRequired - remainingToConsume} atoms were available in WIP.`
          );
        }
      }

      // Create ProductionOutput record
      const output = await tx.productionOutput.create({
        data: {
          workspaceId,
          taskId: currentTask.id,
          attemptNumber: currentTask.attemptNumber,
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

      // Gate: If task is completing or moving to WAITING_QC, verify required task evidence forms are finalized
      await assertRequiredFormsFinalized(tx, {
        workspaceId,
        subjectType: 'TASK',
        subjectId: currentTask.id,
      });

      // Update Task status
      const nextStatus = isFinalOp
        ? 'WAITING_QC'
        : taskOutputComplete
          ? 'COMPLETED'
          : currentTask.status;
      const updatedTask = await tx.task.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: currentTask.id,
          },
        },
        data: {
          status: nextStatus,
          completedAt: !isFinalOp && taskOutputComplete ? now : undefined,
          version: { increment: 1 },
        },
      });

      // If successor tasks exist and this task COMPLETED, promote successors with all predecessors completed to READY
      if (!isFinalOp && taskOutputComplete) {
        const successors = await tx.taskDependency.findMany({
          where: { workspaceId, predecessorTaskId: currentTask.id },
          include: { successor: { include: { predecessorDeps: true } } },
        });

        for (const succ of successors) {
          const allPreds = succ.successor.predecessorDeps;
          const otherPreds = allPreds.filter((p: any) => p.predecessorTaskId !== currentTask.id);
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
          instanceId: currentTask.instanceId,
          taskId: currentTask.id,
          fromStatus: currentTask.status,
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
