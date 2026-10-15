import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import {
  AnalyzeImpactInput,
  AnalyzeImpactSchema,
  ImpactAnalysisResult,
  OrderImpactDTO,
  TaskImpactDTO,
} from './impact-contracts';
import { calculateCPM, CPMTaskInput } from '@/engines/cpm';
import { addWorkDays, daysBetween, DEFAULT_CALENDAR } from '@/engines/calendar';

export class ImpactAnalysisService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Evaluates downstream schedule, order delivery promises, and critical paths
   * against actual database-backed records and scenarios (material delay, machine down, task overrun).
   */
  async analyzeImpact(
    principal: Principal,
    rawInput: unknown
  ): Promise<ImpactAnalysisResult> {
    requireAnyPermission(principal, [
      'planning.write',
      'planning.assign',
      'order.read',
      'owner',
    ]);

    const input: AnalyzeImpactInput = AnalyzeImpactSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // 1. Fetch relevant open / active orders in the workspace
    const activeOrders = await this.db.order.findMany({
      where: {
        workspaceId,
        status: { in: ['CONFIRMED', 'RELEASED', 'IN_PRODUCTION', 'PENDING_REVIEW'] },
      },
      include: {
        customer: true,
        demands: {
          include: {
            item: true,
          },
        },
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    predecessorDeps: true,
                    successorDeps: true,
                    workSessions: true,
                    assignedMachine: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Flatten all tasks
    const allTasks: Array<{
      id: string;
      nodeKey: string;
      orderId: string;
      orderNumber: string;
      customerName: string;
      status: string;
      plannedDurationMinutes: number;
      actualDurationMinutes: number;
      predecessors: string[];
      materialItemIds: string[];
      machineId: string | null;
      machineName: string | null;
      promisedDate: Date | null;
    }> = [];

    for (const order of activeOrders) {
      for (const mo of order.manufacturingOrders) {
        for (const js of mo.jobsheets) {
          for (const task of js.tasks) {
            // Associated demands for this task or order
            const taskDemands = order.demands.filter(
              (d) => !d.taskId || d.taskId === task.id
            );
            const materialItemIds = taskDemands.map((d) => d.itemId);

            allTasks.push({
              id: task.id,
              nodeKey: task.nodeKey,
              orderId: order.id,
              orderNumber: order.orderNumber,
              customerName: order.customer.name,
              status: task.status,
              plannedDurationMinutes: task.plannedDurationMinutes,
              actualDurationMinutes: task.actualDurationMinutes,
              predecessors: task.predecessorDeps.map((p) => p.predecessorTaskId),
              materialItemIds,
              machineId: task.assignedMachineId,
              machineName: task.assignedMachine?.name ?? null,
              promisedDate: order.promisedDate,
            });
          }
        }
      }
    }

    // 2. Identify entity name & directly blocked tasks
    let entityName = input.entityId;
    const directlyBlockedTaskIds = new Set<string>();

    if (input.disruptionType === 'MATERIAL_DELAY') {
      const item = await this.db.item.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.entityId,
          },
        },
      });
      if (item) {
        entityName = `${item.name} (${item.code})`;
      }

      for (const t of allTasks) {
        if (t.materialItemIds.includes(input.entityId) && t.status !== 'COMPLETED') {
          directlyBlockedTaskIds.add(t.id);
        }
      }
    } else if (input.disruptionType === 'MACHINE_DOWNTIME') {
      const machine = await this.db.machine.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.entityId,
          },
        },
      });
      if (machine) {
        entityName = machine.name;
      }

      for (const t of allTasks) {
        if (t.machineId === input.entityId && t.status !== 'COMPLETED') {
          directlyBlockedTaskIds.add(t.id);
        }
      }
    } else if (input.disruptionType === 'TASK_OVERRUN') {
      const targetTask = allTasks.find((t) => t.id === input.entityId);
      if (targetTask) {
        entityName = `Task ${targetTask.nodeKey} (${targetTask.orderNumber})`;
        directlyBlockedTaskIds.add(targetTask.id);
      }
    }

    // 3. Ripple effect forward traversal to find all downstream blocked tasks
    const blockedTaskIdsSet = new Set<string>(directlyBlockedTaskIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of allTasks) {
        if (!blockedTaskIdsSet.has(t.id) && t.status !== 'COMPLETED') {
          const hasBlockedPredecessor = t.predecessors.some((pId) =>
            blockedTaskIdsSet.has(pId)
          );
          if (hasBlockedPredecessor) {
            blockedTaskIdsSet.add(t.id);
            changed = true;
          }
        }
      }
    }

    const blockedTaskIds = Array.from(blockedTaskIdsSet);
    const runnableTaskIds = allTasks
      .filter((t) => t.status !== 'COMPLETED' && !blockedTaskIdsSet.has(t.id))
      .map((t) => t.id);

    // 4. Calculate CPM with remaining hours and earliest start delay
    const delayHours = input.delayHours ?? input.delayDays * 8; // 8h working day basis
    const cpmInputs: CPMTaskInput[] = allTasks.map((t) => {
      // Remaining work = planned - actual, clamped to >= 0
      const remainingMinutes =
        t.status === 'COMPLETED'
          ? 0
          : Math.max(0, t.plannedDurationMinutes - t.actualDurationMinutes);
      const remainingHours = Math.ceil(remainingMinutes / 60);

      // If directly blocked by material/machine downtime, push earliestStartHours
      const earliestStartHours = directlyBlockedTaskIds.has(t.id) ? delayHours : 0;

      return {
        id: t.id,
        durationHours: Math.ceil(t.plannedDurationMinutes / 60),
        remainingDurationHours: remainingHours,
        dependsOn: t.predecessors,
        earliestStartHours,
      };
    });

    const anchorDate = new Date().toISOString().slice(0, 10);
    const cpmResult = calculateCPM(cpmInputs, anchorDate, DEFAULT_CALENDAR);

    // 5. Build Task & Order Impact Projections
    const affectedOrdersMap = new Map<string, OrderImpactDTO>();
    const affectedTasks: TaskImpactDTO[] = [];

    for (const t of allTasks) {
      const cpmOut = cpmResult.tasks[t.id];
      const isDirect = directlyBlockedTaskIds.has(t.id);
      const isDownstream = blockedTaskIdsSet.has(t.id) && !isDirect;
      const isRunnable = runnableTaskIds.includes(t.id);

      const remainingMinutes =
        t.status === 'COMPLETED'
          ? 0
          : Math.max(0, t.plannedDurationMinutes - t.actualDurationMinutes);

      const taskImpact: TaskImpactDTO = {
        taskId: t.id,
        taskName: `Task ${t.nodeKey}`,
        orderId: t.orderId,
        orderNumber: t.orderNumber,
        status: t.status,
        isDirectlyBlocked: isDirect,
        isDownstreamBlocked: isDownstream,
        isRunnable,
        plannedDurationMinutes: t.plannedDurationMinutes,
        remainingMinutes,
        originalScheduledEndAt: t.promisedDate ? t.promisedDate.toISOString() : null,
        newProjectedEndAt: cpmResult.projectedFinishDate,
        slackHours: cpmOut?.totalSlack ?? 0,
        isCritical: cpmOut?.isCritical ?? false,
      };
      affectedTasks.push(taskImpact);

      if (blockedTaskIdsSet.has(t.id)) {
        if (!affectedOrdersMap.has(t.orderId)) {
          const originalPromised = t.promisedDate
            ? t.promisedDate.toISOString().slice(0, 10)
            : anchorDate;
          const newExpectedDate = addWorkDays(
            originalPromised,
            input.delayDays,
            DEFAULT_CALENDAR
          );
          const deltaDays = input.delayDays;

          affectedOrdersMap.set(t.orderId, {
            orderId: t.orderId,
            orderNumber: t.orderNumber,
            customerName: t.customerName,
            originalPromisedDate: t.promisedDate?.toISOString() ?? null,
            newProjectedDate: newExpectedDate,
            deltaDays,
            severity: deltaDays > 2 ? 'AT_RISK' : 'WATCH',
            affectedTasksCount: 1,
          });
        } else {
          const existing = affectedOrdersMap.get(t.orderId)!;
          existing.affectedTasksCount += 1;
        }
      }
    }

    const affectedOrders = Array.from(affectedOrdersMap.values());
    const criticalPathTaskIds = cpmResult.criticalPath;

    // 6. Compute input hash for reproducibility
    const inputHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          workspaceId,
          input,
          tasksCount: allTasks.length,
          blockedCount: blockedTaskIds.length,
        })
      )
      .digest('hex');

    const evaluationId = crypto.randomUUID();

    const summary =
      affectedOrders.length > 0
        ? `${affectedOrders.length} order(s) and ${blockedTaskIds.length} task(s) affected by ${input.disruptionType.toLowerCase().replace('_', ' ')} on ${entityName} (+${input.delayDays}d).`
        : `No active production orders are blocked by disruption on ${entityName}.`;

    return {
      evaluationId,
      inputHash,
      evaluatedAt: new Date().toISOString(),
      disruptionType: input.disruptionType,
      entityId: input.entityId,
      entityName,
      delayDays: input.delayDays,
      affectedOrders,
      affectedTasks,
      criticalPathTaskIds,
      blockedTaskIds,
      runnableTaskIds,
      summary,
    };
  }
}
