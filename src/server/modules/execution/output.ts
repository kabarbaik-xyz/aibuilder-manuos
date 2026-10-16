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
import { executionTaskScope } from './scope';

function hasDownstreamProductionOperation(
  taskId: string,
  dependencies: Array<{
    predecessorTaskId: string;
    successor: { id: string; nodeKey: string };
  }>,
  operationNodeKeys: Set<string>,
  knownNodeKeys: Set<string>
): boolean {
  const pending = dependencies
    .filter((dependency) => dependency.predecessorTaskId === taskId)
    .map((dependency) => dependency.successor);
  const visited = new Set<string>();
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (visited.has(next.id)) continue;
    visited.add(next.id);
    // An unknown instantiated node is treated as production work until the
    // workflow definition is reconciled; it must not make output customer-final.
    if (operationNodeKeys.has(next.nodeKey) || !knownNodeKeys.has(next.nodeKey)) return true;
    for (const dependency of dependencies) {
      if (dependency.predecessorTaskId === next.id && !visited.has(dependency.successor.id)) {
        pending.push(dependency.successor);
      }
    }
  }
  return false;
}

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
  const task = await db.task.findFirst({
    where: {
      ...executionTaskScope(principal),
      id: input.taskId,
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
  const lotNumber = input.lotNumber || `LOT-${order.orderNumber}-${task.nodeKey}`;

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
        where: {
          workspaceId_id: { workspaceId, id: input.taskId },
          ...executionTaskScope(principal),
        },
        include: {
          instance: { include: { workflowVersion: { include: { nodes: true } } } },
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

      const operationNodeKeys = new Set<string>(
        currentTask.instance.workflowVersion.nodes
          .filter((node: { type: string }) => node.type === 'OPERATION')
          .map((node: { key: string }) => node.key)
      );
      const knownNodeKeys = new Set<string>(
        currentTask.instance.workflowVersion.nodes.map((node: { key: string }) => node.key)
      );
      const taskDependencies = await tx.taskDependency.findMany({
        where: { workspaceId, instanceId: currentTask.instanceId },
        include: { successor: { select: { id: true, nodeKey: true } } },
      });
      const hasDownstreamOperation = hasDownstreamProductionOperation(
        currentTask.id,
        taskDependencies,
        operationNodeKeys,
        knownNodeKeys
      );
      if (input.isFinal && hasDownstreamOperation) {
        throw new BadRequestError(
          `Task '${currentTask.nodeKey}' has downstream production operations and cannot be declared final by the output request.`
        );
      }
      const isFinalOp = !hasDownstreamOperation;

      const currentDestination = await tx.location.findFirst({
        where: {
          workspaceId,
          id: input.destinationLocationId,
          isActive: true,
          archivedAt: null,
        },
      });
      if (!currentDestination) {
        throw new NotFoundError(`Destination location '${input.destinationLocationId}' is not active at commit time`);
      }
      if (!['QUARANTINE', 'FG', 'WIP'].includes(currentDestination.kind)) {
        throw new BadRequestError(`Destination location must be QUARANTINE, FG, or WIP, but got '${currentDestination.kind}'`);
      }
      const currentItemRecord = await tx.item.findFirst({
        where: { workspaceId, id: targetItemId, isActive: true, archivedAt: null },
      });
      if (!currentItemRecord) throw new NotFoundError(`Target item '${targetItemId}' is not active at commit time`);

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
      const currentOrder = await tx.order.findUnique({
        where: { workspaceId_id: { workspaceId, id: order.id } },
        include: { lines: true },
      });
      if (!currentOrder) throw new NotFoundError(`Order '${order.id}' not found`);
      const matchingLines = currentOrder.lines.filter((line: { id: string; itemId: string; orderedAtoms: bigint }) => line.itemId === targetItemId);
      const manufacturingOrderLineId = currentTask.jobsheet?.manufacturingOrder?.orderLineId;
      let targetOrderLine = manufacturingOrderLineId
        ? matchingLines.find((line: { id: string }) => line.id === manufacturingOrderLineId)
        : matchingLines.length === 1
          ? matchingLines[0]
          : undefined;
      if (matchingLines.length > 1 && !manufacturingOrderLineId) {
        throw new BadRequestError(
          `Task '${currentTask.nodeKey}' is not linked to a specific order line for item '${targetItemId}'.`
        );
      }
      if (manufacturingOrderLineId && !targetOrderLine) {
        throw new BadRequestError(
          `Task '${currentTask.nodeKey}' is linked to order line '${manufacturingOrderLineId}', which does not contain item '${targetItemId}'.`
        );
      }
      const orderedForItem = targetOrderLine?.orderedAtoms ??
        (currentOrder.lines.length === 0 && targetItemId === currentOrder.itemId ? currentOrder.orderedAtoms : 0n);
      if (orderedForItem <= 0n) {
        throw new BadRequestError(`Output item '${targetItemId}' is not part of order '${currentOrder.id}'.`);
      }
      const configuredTaskTarget = currentTask.targetAtoms > 0n
        ? currentTask.targetAtoms
        : currentTask.jobsheet?.manufacturingOrder?.targetAtoms ?? orderedForItem;
      const taskTargetAtoms = configuredTaskTarget > orderedForItem ? orderedForItem : configuredTaskTarget;
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
        include: {
          task: { include: { jobsheet: { include: { manufacturingOrder: true } } } },
        },
      });
      if (isFinalOp) {
        const finalOutputAtoms = existingOutputs.reduce((total: bigint, output: any) => {
          const outputOrderLineId = output.task.jobsheet?.manufacturingOrder?.orderLineId;
          const belongsToLine = targetOrderLine
            ? outputOrderLineId === targetOrderLine.id || (!outputOrderLineId && matchingLines.length === 1)
            : !outputOrderLineId;
          return belongsToLine ? total + output.outputAtoms : total;
        }, 0n);
        if (finalOutputAtoms + input.outputAtoms > orderedForItem) {
          throw new BadRequestError(
            `Overproduction rejected: final output for item '${targetItemId}' (${finalOutputAtoms + input.outputAtoms} atoms) exceeds ordered quantity (${orderedForItem} atoms).`
          );
        }
      }

      if (currentItemRecord.tracking === 'LOT') {
        const lot = await tx.lot.upsert({
          where: {
            workspaceId_itemId_lotNumber: {
              workspaceId,
              itemId: currentItemRecord.id,
              lotNumber,
            },
          },
          create: {
            workspaceId,
            itemId: currentItemRecord.id,
            lotNumber,
            receivedAt: now,
          },
          update: {},
        });
        lotId = lot.id;
      }

      let serialId: string | null = null;
      if (currentItemRecord.tracking === 'SERIAL') {
        if (!isFinalOp || !input.serialNumber || input.outputAtoms !== 1_000_000n) {
          throw new BadRequestError('Serialized output requires one complete unit, an explicit serial number, and a final production operation');
        }
        if (input.lotNumber) throw new BadRequestError('Serialized output uses a dedicated unit lot; omit the batch lot number');
        const existingSerial = await tx.serial.findFirst({ where: { workspaceId, serialNumber: input.serialNumber } });
        if (existingSerial) throw new BadRequestError('Serial number already exists; record rework against its existing output instead');
        const unitLot = await tx.lot.create({ data: {
          workspaceId, itemId: currentItemRecord.id, lotNumber: `SERIAL:${input.serialNumber}`, receivedAt: now,
        } });
        lotId = unitLot.id;
        const serial = await tx.serial.create({ data: {
          workspaceId, itemId: currentItemRecord.id, lotId, serialNumber: input.serialNumber, status: 'AVAILABLE',
        } });
        serialId = serial.id;
      } else if (input.serialNumber) {
        throw new BadRequestError('Serial numbers may only be recorded for serial-tracked items');
      }

      // Post physical inventory movement for the produced goods into destination location
      const movement = await postMovement(
        tx,
        principal,
        {
          movementType: MovementType.PRODUCTION_OUTPUT,
          itemId: currentItemRecord.id,
          sourceLocationId: null, // Production virtual boundary
          destinationLocationId: currentDestination.id,
          destinationLotId: lotId,
          atoms: input.outputAtoms,
          referenceType: MovementReferenceType.TASK,
          referenceId: currentTask.id,
          notes: input.notes || `Production output from task ${currentTask.nodeKey}`,
        },
        requestId
      );

      // Reconcile and consume remaining WIP for this task if BOM demands exist
      const currentDemands = await tx.materialDemand.findMany({
        where: { workspaceId, orderId: order.id },
        include: { item: true },
      });
      const unassignedDemands = currentDemands.filter((d: { taskId: string | null }) => !d.taskId);
      if (unassignedDemands.length > 0) {
        const taskCount = await tx.task.count({ where: { workspaceId, instanceId: currentTask.instanceId } });
        if (taskCount > 1) {
          throw new BadRequestError(
            `Order contains ${unassignedDemands.length} material demand(s) without an operation assignment. Bind each BOM line to a workflow operation before recording multi-step output.`
          );
        }
      }
      const demands = currentDemands.filter((d: { taskId: string | null }) => d.taskId === currentTask.id || (!d.taskId && unassignedDemands.length > 0));
      for (const demand of demands) {
        const orderTasks = await tx.task.findMany({
          where: { workspaceId, instance: { orderId: order.id } },
          select: { id: true },
        });
        const taskIds = orderTasks.map((task: { id: string }) => task.id);
        const [issuedMoves, returnedMoves, consumedMoves] = await Promise.all([
          tx.stockMovement.findMany({
            where: { workspaceId, movementType: MovementType.ISSUE_TO_WIP, itemId: demand.itemId, referenceId: order.id },
            select: { destinationLocationId: true, destinationLotId: true, atoms: true },
          }),
          tx.stockMovement.findMany({
            where: { workspaceId, movementType: MovementType.RETURN_FROM_WIP, itemId: demand.itemId, referenceId: order.id },
            select: { sourceLocationId: true, sourceLotId: true, atoms: true },
          }),
          taskIds.length
            ? tx.stockMovement.findMany({
                where: { workspaceId, movementType: MovementType.PRODUCTION_CONSUME, itemId: demand.itemId, referenceId: { in: taskIds } },
                select: { sourceLocationId: true, sourceLotId: true, atoms: true },
              })
            : Promise.resolve([]),
        ]);
        const bucketKey = (locationId: string | null, lotId: string | null) => `${locationId ?? ''}:${lotId ?? ''}`;
        const issuedByBucket = new Map<string, bigint>();
        for (const movement of issuedMoves) {
          if (movement.destinationLocationId) {
            const key = bucketKey(movement.destinationLocationId, movement.destinationLotId);
            issuedByBucket.set(key, (issuedByBucket.get(key) ?? 0n) + movement.atoms);
          }
        }
        for (const movement of [...returnedMoves, ...consumedMoves] as Array<{ sourceLocationId: string | null; sourceLotId: string | null; atoms: bigint }>) {
          const key = bucketKey(movement.sourceLocationId, movement.sourceLotId);
          issuedByBucket.set(key, (issuedByBucket.get(key) ?? 0n) - movement.atoms);
        }
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
          const attributedAvailable = issuedByBucket.get(bucketKey(bal.locationId, bal.lotId)) ?? 0n;
          const available = [bal.onHandAtoms, attributedAvailable].reduce((minimum, amount) => amount < minimum ? amount : minimum);
          const consumeFromThis = available >= remainingToConsume ? remainingToConsume : available;
          if (consumeFromThis <= 0n) continue;

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
          itemId: currentItemRecord.id,
          lotId,
          serialId,
          outputAtoms: input.outputAtoms,
          destinationLocationId: currentDestination.id,
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
      const nextStatus = taskOutputComplete
        ? isFinalOp
          ? 'WAITING_QC'
          : 'COMPLETED'
        : currentTask.status;
      let completedSessionMinutes = 0;
      if (taskOutputComplete && currentTask.status === 'RUNNING') {
        const activeSession = await tx.workSession.findFirst({
          where: { workspaceId, taskId: currentTask.id, sessionType: 'RUNNING', endedAt: null },
          orderBy: { startedAt: 'desc' },
        });
        if (activeSession) {
          completedSessionMinutes = Math.max(
            1,
            Math.round((now.getTime() - activeSession.startedAt.getTime()) / 60000)
          );
          await tx.workSession.update({
            where: { workspaceId_id: { workspaceId, id: activeSession.id } },
            data: {
              endedAt: now,
              durationMinutes: completedSessionMinutes,
              version: { increment: 1 },
            },
          });
        }
      }
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
          ...(completedSessionMinutes > 0
            ? { actualDurationMinutes: { increment: completedSessionMinutes } }
            : {}),
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
            destinationLocationId: currentDestination.id,
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
