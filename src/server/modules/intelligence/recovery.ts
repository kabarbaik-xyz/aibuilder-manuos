import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { executeCommand, hashPayload } from '@/server/db/transaction';
import { z } from 'zod';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';
import { PlanningService } from '@/server/modules/planning/service';
import { accumulateOvertimeMinutes } from '@/server/modules/masters/overtime-policy';

const RejectProposalSchema = z.object({
  proposalId: z.string().uuid(),
  note: z.string().min(1).max(1000),
});
const ApplyScheduleReviewSchema = z.object({ optionId: z.string().min(1).optional() }).default({});
const CreateSubcontractPlanSchema = z.object({ taskId: z.string().uuid(), supplierId: z.string().uuid(), notes: z.string().max(1000).optional() }).strict();
const SubcontractBatchStatusSchema = z.object({ status: z.literal('IN_PROGRESS'), vendorReference: z.string().trim().max(120).optional() }).strict();
const ReturnSubcontractBatchSchema = z.object({ returnedAtoms: z.string().regex(/^\d+$/).refine(value => BigInt(value) > 0n), vendorReference: z.string().trim().max(120).optional() }).strict();
const RecoveryPolicySchema = z.object({ expectedRevision: z.number().int().positive(), recoveryBatchAtoms: z.string().regex(/^\d+$/).refine(value => BigInt(value) >= 0n && BigInt(value) <= 9_000_000_000_000_000n) }).strict();
const RecoveryListQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  status: z.enum(['PROPOSED', 'REJECTED', 'APPROVED', 'SUPERSEDED']).optional(),
  search: z.string().trim().max(120).optional(),
});

type RecoveryListItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  status: string;
  orderVersion: number;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  approverName: string | null;
  approverJobTitle: string | null;
  isCurrentApprover: boolean;
  proposal: RecoveryProposalDTO | null;
};

function parseSavedProposal(value: string): RecoveryProposalDTO | null {
  try {
    const optionSchema = z.object({
      id: z.string(), type: z.string(), title: z.string(), description: z.string(), feasible: z.boolean(),
      infeasibleReason: z.string().optional(), isRecommended: z.boolean(), timeRecoveredDays: z.number(),
      costImpactPct: z.number(), capacityImpact: z.string(),
      allocation: z.object({ tranche1Qty: z.number(), tranche1Date: z.string(), tranche2Qty: z.number(), tranche2Date: z.string() }).optional(),
    });
    const scheduleReviewSchema = z.object({
      instanceId: z.string(), workflowVersionId: z.string(), engineeringRevisionId: z.string(),
      facilityId: z.string().nullable(), facilityTimezone: z.string().nullable(), horizonStart: z.string(), horizonEnd: z.string(),
      evaluatedAt: z.string(), projectedEndAt: z.string().nullable(),
      machineCostEstimate: z.object({ status: z.enum(['COMPLETE', 'PARTIAL', 'NOT_AVAILABLE']), currency: z.string(), totalMinorUnits: z.number().int().nullable(), pricedTaskCount: z.number().int(), unpricedTaskCount: z.number().int() }).optional(),
      overtimeAlternatives: z.array(z.object({
        id: z.string(), state: z.literal('COMPLETE'), technicianId: z.string(), technicianName: z.string(),
        approverMembershipId: z.string(), approverName: z.string(), startAt: z.string(), endAt: z.string(), projectedEndAt: z.string(),
        tasks: z.array(z.object({
          taskId: z.string(), version: z.number().int(), nodeKey: z.string(), status: z.literal('SCHEDULED'), startAt: z.string(), endAt: z.string(),
          technicianId: z.string().nullable().optional(), technicianName: z.string().nullable(), machineId: z.string().nullable().optional(), machineName: z.string().nullable(), predecessorTaskIds: z.array(z.string()),
        })),
      })).optional(),
      alternatives: z.array(z.object({
        id: z.string(), state: z.literal('COMPLETE'), taskId: z.string(), nodeKey: z.string(), machineId: z.string(), machineName: z.string(), projectedEndAt: z.string(),
        machineCostEstimate: z.object({ status: z.enum(['COMPLETE', 'PARTIAL', 'NOT_AVAILABLE']), currency: z.string(), totalMinorUnits: z.number().int().nullable(), pricedTaskCount: z.number().int(), unpricedTaskCount: z.number().int() }),
        tasks: z.array(z.object({
          taskId: z.string(), version: z.number().int(), nodeKey: z.string(), status: z.literal('SCHEDULED'), startAt: z.string(), endAt: z.string(),
          technicianId: z.string().nullable().optional(), technicianName: z.string().nullable(), machineId: z.string().nullable().optional(), machineName: z.string().nullable(), predecessorTaskIds: z.array(z.string()),
        })),
      })).optional(),
      taskVersions: z.array(z.object({ taskId: z.string(), version: z.number().int() })),
      tasks: z.array(z.object({
        taskId: z.string(), version: z.number().int(), nodeKey: z.string(), startAt: z.string().nullable(), endAt: z.string().nullable(),
        technicianId: z.string().nullable().optional(), technicianName: z.string().nullable(),
        machineId: z.string().nullable().optional(), machineName: z.string().nullable(), predecessorTaskIds: z.array(z.string()),
      })),
      assumptions: z.array(z.string()),
    });
    const schema = z.object({
      id: z.string(), orderId: z.string(), orderNumber: z.string(),
      mode: z.enum(['LEGACY_SIMULATION', 'SCHEDULE_REVIEW']).optional(), state: z.literal('SAVED').optional(),
      totalQty: z.number().optional(), readyQcPassedQty: z.number().optional(),
      originalPromisedDate: z.string().nullable().optional(), projectedDelayedDate: z.string().optional(),
      options: z.array(optionSchema).default([]), createdAt: z.string(), scheduleReview: scheduleReviewSchema.optional(),
    });
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function dateInTimezone(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function subcontractPlanDto(plan: {
  id: string; workspaceId: string; orderId: string; taskId: string; supplierId: string; plannedAtoms: bigint; batchLimitAtoms: bigint;
  status: string; proposedById: string; approverMembershipId: string; approvedById: string | null; approvedAt: Date | null;
  returnedAt: Date | null; notes: string | null; version: number; createdAt: Date;
  supplier: { name: string; code: string }; task: { nodeKey: string; status: string; version: number }; order: { orderNumber: string };
  batches: Array<{ id: string; batchNumber: number; quantityAtoms: bigint; returnedAtoms: bigint; status: string; vendorReference: string | null; sentAt: Date | null; returnedAt: Date | null }>;
}) {
  return {
    id: plan.id, orderId: plan.orderId, orderNumber: plan.order.orderNumber, taskId: plan.taskId, nodeKey: plan.task.nodeKey,
    taskStatus: plan.task.status, supplierId: plan.supplierId, supplierCode: plan.supplier.code, supplierName: plan.supplier.name,
    plannedAtoms: plan.plannedAtoms.toString(), returnedAtoms: plan.batches.reduce((sum, batch) => sum + batch.returnedAtoms, 0n).toString(),
    batchLimitAtoms: plan.batchLimitAtoms.toString(), status: plan.status,
    proposedById: plan.proposedById, approverMembershipId: plan.approverMembershipId, approvedById: plan.approvedById,
    approvedAt: plan.approvedAt?.toISOString() ?? null, returnedAt: plan.returnedAt?.toISOString() ?? null,
    notes: plan.notes, version: plan.version, createdAt: plan.createdAt.toISOString(),
    batches: plan.batches.map(batch => ({ ...batch, quantityAtoms: batch.quantityAtoms.toString(), returnedAtoms: batch.returnedAtoms.toString(), sentAt: batch.sentAt?.toISOString() ?? null, returnedAt: batch.returnedAt?.toISOString() ?? null })),
  };
}
import {
  ApproveRecoveryInput,
  ApproveRecoverySchema,
  ProposeRecoveryInput,
  ProposeRecoverySchema,
  RecoveryProposalDTO,
  ScheduleRecoveryReviewInput,
  ScheduleRecoveryReviewResult,
  ScheduleRecoveryReviewSchema,
} from './recovery-contracts';
import { generateRecoveryOptions } from '@/engines/recovery';
import { addWorkDays, DEFAULT_CALENDAR } from '@/engines/calendar';


export class RecoveryService {
  private readonly scheduleProposals: ScheduleProposalService;
  private readonly planning: PlanningService;

  constructor(private readonly db: PrismaClient) {
    this.scheduleProposals = new ScheduleProposalService(db);
    this.planning = new PlanningService(db);
  }

  /** Save a schedule-grounded recovery review; applying it still requires revalidation. */
  async proposeScheduleReview(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey: string
  ): Promise<ScheduleRecoveryReviewResult> {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const input: ScheduleRecoveryReviewInput = ScheduleRecoveryReviewSchema.parse(rawInput);
    const existingReceipt = await this.db.commandReceipt.findUnique({
      where: { workspaceId_principalId_key: { workspaceId: principal.workspaceId, principalId: principal.userId, key: idempotencyKey } },
      select: { commandType: true, requestHash: true, resultJson: true },
    });
    if (existingReceipt) {
      if (existingReceipt.commandType !== 'recovery.schedule-review.create' || existingReceipt.requestHash !== hashPayload(input)) {
        throw new ConflictError(`Idempotency key '${idempotencyKey}' was already submitted with a different request payload`, 'DUPLICATE_KEY_PAYLOAD', false);
      }
      return JSON.parse(existingReceipt.resultJson) as RecoveryProposalDTO;
    }
    const schedule = await this.scheduleProposals.propose(principal, {
      orderId: input.orderId,
      instanceId: input.instanceId,
      startHorizon: new Date(Date.now() + 5 * 60_000).toISOString(),
      horizonDays: 30,
    });
    const overtimeAlternatives: NonNullable<RecoveryProposalDTO['scheduleReview']>['overtimeAlternatives'] = [];
    if (schedule.state !== 'NO_OPEN_TASKS') {
      const workspace = await this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { timezone: true, maxOvertimeMinutesPerDay: true, maxOvertimeMinutesPerWeek: true } });
      const technicianIds = [...new Set(schedule.tasks.flatMap(task => task.technicianId ? [task.technicianId] : []))];
      if (workspace && technicianIds.length) {
        const shifts = await this.db.rosterInterval.findMany({
          where: { workspaceId: principal.workspaceId, technicianId: { in: technicianIds }, intervalType: 'SHIFT', status: 'PUBLISHED', startAt: { gte: new Date(schedule.scope.horizonStart) }, endAt: { lt: new Date(schedule.scope.horizonEnd) } },
          include: { technician: { select: { id: true, name: true } } }, orderBy: [{ endAt: 'asc' }, { technicianId: 'asc' }], take: 100,
        });
        const seenScenario = new Set<string>();
        for (const shift of shifts) {
          if (!shift.technician || overtimeAlternatives.length >= 12) continue;
          const technicianMembership = await this.db.membership.findFirst({
            where: { workspaceId: principal.workspaceId, technicianId: shift.technician.id, status: 'ACTIVE', supervisorMembershipId: { not: null } },
            select: { supervisorMembershipId: true },
          });
          if (!technicianMembership?.supervisorMembershipId) continue;
          const approver = await this.db.membership.findFirst({
            where: { id: technicianMembership.supervisorMembershipId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
            select: { id: true, user: { select: { name: true } } },
          });
          if (!approver) continue;
          const existingOvertime = await this.db.rosterInterval.findMany({
            where: { workspaceId: principal.workspaceId, technicianId: shift.technician.id, intervalType: 'OVERTIME', status: { in: ['DRAFT', 'PUBLISHED'] }, startAt: { lt: new Date(schedule.scope.horizonEnd) }, endAt: { gt: new Date(schedule.scope.horizonStart) } },
            select: { startAt: true, endAt: true },
          });
          const durations = [60, 120, Math.min(240, workspace.maxOvertimeMinutesPerDay, workspace.maxOvertimeMinutesPerWeek)];
          for (const minutes of [...new Set(durations)]) {
            if (minutes <= 0 || overtimeAlternatives.length >= 12) continue;
            const startAt = shift.endAt;
            const endAt = new Date(startAt.getTime() + minutes * 60_000);
            if (endAt > new Date(schedule.scope.horizonEnd)) continue;
            const dailyKey = new Intl.DateTimeFormat('en-CA', { timeZone: workspace.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startAt);
            if (dailyKey !== new Intl.DateTimeFormat('en-CA', { timeZone: workspace.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(endAt.getTime() - 1))) continue;
            const totals = accumulateOvertimeMinutes([...existingOvertime, { startAt, endAt }], workspace.timezone);
            if ([...totals.byDay.values()].some(value => value > workspace.maxOvertimeMinutesPerDay) || [...totals.byWeek.values()].some(value => value > workspace.maxOvertimeMinutesPerWeek)) continue;
            const scenarioKey = `${shift.technician.id}:${startAt.toISOString()}:${endAt.toISOString()}`;
            if (seenScenario.has(scenarioKey)) continue;
            seenScenario.add(scenarioKey);
            let candidateSchedule;
            try {
              candidateSchedule = await this.scheduleProposals.propose(principal, {
                orderId: input.orderId, instanceId: input.instanceId,
                startHorizon: schedule.scope.horizonStart, horizonDays: 30,
              }, { overtimeOverride: { technicianId: shift.technician.id, startAt, endAt } });
            } catch {
              continue;
            }
            if (candidateSchedule.state !== 'COMPLETE' || !candidateSchedule.projectedEndAt || candidateSchedule.tasks.some(item => item.status !== 'SCHEDULED' || !item.startAt || !item.endAt)) continue;
            if (schedule.state === 'COMPLETE' && schedule.projectedEndAt && new Date(candidateSchedule.projectedEndAt) >= new Date(schedule.projectedEndAt)) continue;
            if (!candidateSchedule.tasks.some(item => item.technicianId === shift.technician!.id && new Date(item.startAt!).getTime() < endAt.getTime() && new Date(item.endAt!).getTime() > startAt.getTime())) continue;
            overtimeAlternatives.push({
              id: `OVERTIME:${shift.technician.id}:${startAt.toISOString()}:${minutes}`,
              state: 'COMPLETE', technicianId: shift.technician.id, technicianName: shift.technician.name,
              approverMembershipId: approver.id, approverName: approver.user.name,
              startAt: startAt.toISOString(), endAt: endAt.toISOString(), projectedEndAt: candidateSchedule.projectedEndAt,
              tasks: candidateSchedule.tasks.map(item => ({
                taskId: item.taskId, version: item.version, nodeKey: item.nodeKey, status: 'SCHEDULED' as const,
                startAt: item.startAt!, endAt: item.endAt!, technicianId: item.technicianId, technicianName: item.technicianName,
                machineId: item.machineId, machineName: item.machineName, predecessorTaskIds: item.predecessorTaskIds,
              })),
            });
          }
        }
      }
    }
    if ((schedule.state !== 'COMPLETE' || !schedule.projectedEndAt) && !overtimeAlternatives.length) {
      const missingInputs = [...new Set([
        ...schedule.tasks.flatMap((task) => task.status === 'UNSCHEDULED' ? task.reasons : []),
        ...(schedule.state === 'NO_OPEN_TASKS' ? ['No open task remains for a recovery schedule review.'] : []),
      ])];
      return { state: 'NOT_CONNECTED', scheduleState: schedule.state, missingInputs };
    }

    const estimateMachineCost = async (tasks: typeof schedule.tasks) => {
      const machineIds = [...new Set(tasks.flatMap(task => task.machineId ? [task.machineId] : []))];
      const [costedMachines, workspace] = await Promise.all([
        machineIds.length ? this.db.machine.findMany({ where: { workspaceId: principal.workspaceId, id: { in: machineIds } }, select: { id: true, hourlyRateCents: true } }) : Promise.resolve([]),
        this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { currency: true } }),
      ]);
      const machineRates = new Map(costedMachines.map(machine => [machine.id, machine.hourlyRateCents]));
      let total = 0n;
      let priced = 0;
      let unpriced = 0;
      for (const task of tasks) {
        if (!task.machineId) continue;
        const rate = machineRates.get(task.machineId);
        const durationMs = task.startAt && task.endAt ? BigInt(new Date(task.endAt).getTime() - new Date(task.startAt).getTime()) : 0n;
        if (rate === null || rate === undefined || durationMs <= 0n) { unpriced += 1; continue; }
        total += (BigInt(rate) * durationMs + 3_600_000n - 1n) / 3_600_000n;
        priced += 1;
      }
      const safeTotal = total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
      return {
        status: !priced && !unpriced ? 'NOT_AVAILABLE' as const : unpriced || safeTotal === null ? 'PARTIAL' as const : 'COMPLETE' as const,
        currency: workspace?.currency ?? 'UNKNOWN', totalMinorUnits: safeTotal, pricedTaskCount: priced, unpricedTaskCount: unpriced,
      };
    };
    const machineCostEstimate = await estimateMachineCost(schedule.tasks);

    // Each alternative reruns the whole finite-capacity schedule with one task pinned
    // to a capable machine. This filters out machines that cannot fit the full schedule.
    const alternatives: NonNullable<RecoveryProposalDTO['scheduleReview']>['alternatives'] = [];
    const candidateTaskIds = new Set<string>();
    for (const task of schedule.tasks) {
      if (!task.machineId || !task.startAt || !task.endAt) continue;
      const currentMachine = await this.db.machine.findFirst({
        where: { id: task.machineId, workspaceId: principal.workspaceId },
        select: { machineClassId: true, facilityId: true },
      });
      if (!currentMachine) continue;
      const candidates = await this.db.machine.findMany({
        where: {
          workspaceId: principal.workspaceId, archivedAt: null, status: 'AVAILABLE',
          machineClassId: currentMachine.machineClassId,
          ...(currentMachine.facilityId ? { OR: [{ facilityId: currentMachine.facilityId }, { facilityId: null }] } : {}),
          id: { not: task.machineId },
        },
        orderBy: [{ recoveryPriority: 'asc' }, { name: 'asc' }], take: 4,
        select: { id: true, name: true },
      });
      for (const candidate of candidates) {
        if (alternatives.length >= 12 || candidateTaskIds.has(`${task.taskId}:${candidate.id}`)) continue;
        const candidateSchedule = await this.scheduleProposals.propose(principal, {
          orderId: input.orderId, instanceId: input.instanceId,
          startHorizon: schedule.scope.horizonStart, horizonDays: 30,
        }, { machineOverride: { taskId: task.taskId, machineId: candidate.id } });
        const replacedTask = candidateSchedule.tasks.find(item => item.taskId === task.taskId);
        if (candidateSchedule.state !== 'COMPLETE' || !candidateSchedule.projectedEndAt || replacedTask?.machineId !== candidate.id || candidateSchedule.tasks.some(item => item.status !== 'SCHEDULED' || !item.startAt || !item.endAt)) continue;
        candidateTaskIds.add(`${task.taskId}:${candidate.id}`);
        const alternativeCost = await estimateMachineCost(candidateSchedule.tasks);
        alternatives.push({
          id: `MACHINE:${task.taskId}:${candidate.id}`, state: 'COMPLETE', taskId: task.taskId, nodeKey: task.nodeKey,
          machineId: candidate.id, machineName: candidate.name, projectedEndAt: candidateSchedule.projectedEndAt,
          machineCostEstimate: alternativeCost,
          tasks: candidateSchedule.tasks.map(item => ({
            taskId: item.taskId, version: item.version, nodeKey: item.nodeKey, status: 'SCHEDULED' as const,
            startAt: item.startAt!, endAt: item.endAt!, technicianId: item.technicianId, technicianName: item.technicianName,
            machineId: item.machineId, machineName: item.machineName, predecessorTaskIds: item.predecessorTaskIds,
          })),
        });
      }
    }

    const proposalId = crypto.randomUUID();
    const proposal: RecoveryProposalDTO = {
      id: proposalId,
      orderId: schedule.scope.orderId,
      orderNumber: schedule.scope.orderNumber,
      mode: 'SCHEDULE_REVIEW',
      state: 'SAVED',
      options: [],
      createdAt: schedule.evaluatedAt,
      scheduleReview: {
        instanceId: schedule.scope.instanceId,
        workflowVersionId: schedule.scope.workflowVersionId,
        engineeringRevisionId: schedule.scope.engineeringRevisionId,
        facilityId: schedule.scope.facilityId,
        facilityTimezone: schedule.scope.facilityTimezone,
        horizonStart: schedule.scope.horizonStart,
        horizonEnd: schedule.scope.horizonEnd,
        evaluatedAt: schedule.evaluatedAt,
        projectedEndAt: schedule.state === 'COMPLETE' ? schedule.projectedEndAt : null,
        machineCostEstimate,
        alternatives,
        overtimeAlternatives,
        taskVersions: schedule.tasks.map(({ taskId, version }) => ({ taskId, version })),
        tasks: schedule.tasks.map((task) => ({
          taskId: task.taskId, version: task.version, nodeKey: task.nodeKey,
          startAt: task.startAt, endAt: task.endAt,
          technicianId: task.technicianId, machineId: task.machineId,
          technicianName: task.technicianName, machineName: task.machineName,
          predecessorTaskIds: task.predecessorTaskIds,
        })),
        assumptions: [
          ...schedule.assumptions,
          'The proposed horizon begins five minutes ahead to leave time for human review; apply rejects slots that have already started.',
          'Saved for review only; resource availability can change. Revalidate schedule and versions before any application.',
          'Overtime alternatives are simulation-only until the affected technician direct supervisor approves and applies one.',
          'No shipment allocation, customer commitment, booking, or overtime cost impact is included.',
        ],
      },
    };
    const taskVersions = proposal.scheduleReview!.taskVersions;
    const committed = await executeCommand({
      principal,
      commandType: 'recovery.schedule-review.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.db,
      handler: async (tx: Prisma.TransactionClient) => {
        const requester = await tx.membership.findFirst({
          where: { id: principal.membershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          select: { supervisorMembershipId: true },
        });
        if (!requester?.supervisorMembershipId) {
          throw new BadRequestError('Assign an active direct supervisor in People & Access before submitting a Recovery schedule for approval.');
        }
        const approver = await tx.membership.findFirst({
          where: { id: requester.supervisorMembershipId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!approver) throw new ConflictError('The assigned supervisor is no longer active. Update the reporting line before submitting Recovery.', 'APPROVER_UNAVAILABLE', true);
        const order = await tx.order.findFirst({
          where: { workspaceId: principal.workspaceId, id: input.orderId },
          select: { version: true },
        });
        if (!order || order.version !== schedule.scope.orderVersion) {
          throw new ConflictError('Order changed while the recovery schedule was being saved. Re-evaluate it.', 'STALE_VERSION', true);
        }
        const currentTasks = await tx.task.findMany({
          where: { workspaceId: principal.workspaceId, id: { in: taskVersions.map(({ taskId }) => taskId) } },
          select: { id: true, version: true },
        });
        if (currentTasks.length !== taskVersions.length || taskVersions.some(({ taskId, version }) => currentTasks.find((task: { id: string }) => task.id === taskId)?.version !== version)) {
          throw new ConflictError('A task changed while the recovery schedule was being saved. Re-evaluate it.', 'STALE_VERSION', true);
        }
        await tx.recoveryProposal.create({
          data: {
            id: proposalId, workspaceId: principal.workspaceId, orderId: input.orderId,
            orderVersion: order.version, proposedById: principal.userId, approverMembershipId: approver.id, proposalJson: JSON.stringify(proposal),
          },
        });
        return {
          data: proposal, aggregateType: 'RECOVERY_PROPOSAL', aggregateId: proposalId, resourceVersion: 1,
          auditDetails: { mode: 'SCHEDULE_REVIEW', instanceId: input.instanceId, taskCount: taskVersions.length, scheduleState: schedule.state, machineCostEstimate },
        };
      },
    });
    return committed.data;
  }

  async listProposals(principal: Principal, rawQuery: unknown) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'order.read']);
    const query = RecoveryListQuerySchema.parse(rawQuery);
    const where = {
      workspaceId: principal.workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        order: { orderNumber: { contains: query.search } },
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.recoveryProposal.findMany({
        where,
        include: { order: { select: { id: true, orderNumber: true, status: true } }, approverMembership: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.recoveryProposal.count({ where }),
    ]);
    const items: RecoveryListItem[] = rows.map((row) => ({
      id: row.id,
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      orderStatus: row.order.status,
      status: row.status,
      orderVersion: row.orderVersion,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
      approverName: row.approverMembership?.user.name ?? null,
      approverJobTitle: row.approverMembership?.jobTitle ?? null,
      isCurrentApprover: row.approverMembershipId === principal.membershipId,
      proposal: parseSavedProposal(row.proposalJson),
    }));
    return { items, page: query.page, pageSize: query.pageSize, total, pageCount: Math.ceil(total / query.pageSize) };
  }

  async getProposal(principal: Principal, proposalId: string): Promise<RecoveryListItem> {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'order.read']);
    const row = await this.db.recoveryProposal.findFirst({
      where: { id: proposalId, workspaceId: principal.workspaceId },
      include: { order: { select: { id: true, orderNumber: true, status: true } }, approverMembership: { include: { user: { select: { name: true } } } } },
    });
    if (!row) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
    return {
      id: row.id,
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      orderStatus: row.order.status,
      status: row.status,
      orderVersion: row.orderVersion,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
      approverName: row.approverMembership?.user.name ?? null,
      approverJobTitle: row.approverMembership?.jobTitle ?? null,
      isCurrentApprover: row.approverMembershipId === principal.membershipId,
      proposal: parseSavedProposal(row.proposalJson),
    };
  }

  /** Submit a current, schedule-grounded date suggestion to the existing approval workflow. */
  async requestScheduleDateReview(principal: Principal, proposalId: string, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'order.release']);
    requireAnyPermission(principal, ['planning.read', 'task.assign']);
    const saved = await this.db.recoveryProposal.findFirst({
      where: { id: proposalId, workspaceId: principal.workspaceId },
      include: { order: { select: { id: true, orderNumber: true, version: true, facility: { select: { timezone: true } } } } },
    });
    if (!saved) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
    if (saved.status !== 'PROPOSED') throw new BadRequestError('Only an open recovery proposal can request a date review.');
    const proposal = parseSavedProposal(saved.proposalJson);
    const snapshot = proposal?.mode === 'SCHEDULE_REVIEW' ? proposal.scheduleReview : null;
    if (!proposal || !snapshot || !snapshot.projectedEndAt) throw new BadRequestError('Only a complete baseline schedule can request a delivery-date review.');

    const current = await this.scheduleProposals.propose(principal, {
      orderId: saved.orderId, instanceId: snapshot.instanceId,
      startHorizon: new Date().toISOString(), horizonDays: 30,
    });
    const timezone = current.scope.facilityTimezone;
    if (current.state !== 'COMPLETE' || !current.projectedEndAt || !timezone || !saved.order.facility?.timezone) {
      throw new ConflictError('Current capacity evidence no longer supports a complete date proposal. Re-evaluate recovery.', 'STALE_SCHEDULE', true);
    }
    const priorDate = dateInTimezone(snapshot.projectedEndAt, snapshot.facilityTimezone ?? timezone);
    const currentDate = dateInTimezone(current.projectedEndAt, timezone);
    if (saved.order.version !== current.scope.orderVersion || snapshot.workflowVersionId !== current.scope.workflowVersionId || snapshot.engineeringRevisionId !== current.scope.engineeringRevisionId || priorDate !== currentDate || snapshot.taskVersions.length !== current.tasks.length || snapshot.taskVersions.some(({ taskId, version }) => current.tasks.find((task) => task.taskId === taskId)?.version !== version)) {
      throw new ConflictError('The saved schedule or its projected local date changed. Generate a fresh recovery proposal before requesting review.', 'STALE_SCHEDULE', true);
    }

    return executeCommand({
      principal,
      commandType: 'recovery.schedule-date-review.create',
      idempotencyKey,
      payload: { proposalId, requestedDate: currentDate },
      prismaClient: this.db,
      handler: async (tx) => {
        const order = await tx.order.findUnique({ where: { workspaceId_id: { workspaceId: principal.workspaceId, id: saved.orderId } }, select: { version: true } });
        if (!order || order.version !== saved.order.version) throw new ConflictError('Order changed before the date request was saved. Re-evaluate recovery.', 'STALE_VERSION', true);
        const currentTasks = await tx.task.findMany({ where: { workspaceId: principal.workspaceId, id: { in: snapshot.taskVersions.map(({ taskId }) => taskId) } }, select: { id: true, version: true } });
        if (currentTasks.length !== snapshot.taskVersions.length || snapshot.taskVersions.some(({ taskId, version }) => currentTasks.find((task: { id: string }) => task.id === taskId)?.version !== version)) {
          throw new ConflictError('A task changed before the date request was saved. Re-evaluate recovery.', 'STALE_VERSION', true);
        }
        const requestCount = await tx.orderChangeRequest.count({ where: { workspaceId: principal.workspaceId } });
        const request = await tx.orderChangeRequest.create({
          data: {
            workspaceId: principal.workspaceId, orderId: saved.orderId,
            requestNumber: `OCR-${String(requestCount + 1).padStart(4, '0')}`,
            changeType: 'DATE', status: 'SUBMITTED',
            reason: `Requested from recovery proposal ${proposal.id} after current finite-capacity revalidation.`,
            requestedChangesJson: JSON.stringify({ requestedDate: currentDate, recoveryProposalId: proposal.id, scheduleEvaluatedAt: current.evaluatedAt }),
            submittedAt: new Date(),
          },
        });
        return {
          data: request, aggregateType: 'ORDER_CHANGE_REQUEST', aggregateId: request.id, resourceVersion: 1,
          auditDetails: { recoveryProposalId: proposal.id, requestedDate: currentDate, taskCount: snapshot.taskVersions.length },
        };
      },
    });
  }

  async getRecoveryPolicy(principal: Principal) {
    requireAnyPermission(principal, ['resource.manage', 'planning.read', 'planning.write', 'task.assign', 'workspace.admin', 'owner']);
    const workspace = await this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { revision: true, recoveryBatchAtoms: true } });
    if (!workspace) throw new NotFoundError('Workspace not found');
    return { revision: workspace.revision, recoveryBatchAtoms: workspace.recoveryBatchAtoms.toString() };
  }

  async updateRecoveryPolicy(principal: Principal, rawInput: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['resource.manage', 'workspace.admin', 'owner']);
    const input = RecoveryPolicySchema.parse(rawInput);
    const recoveryBatchAtoms = BigInt(input.recoveryBatchAtoms);
    return executeCommand({
      principal, commandType: 'recovery.batch-policy.update', idempotencyKey,
      expectedVersion: input.expectedRevision, payload: input, prismaClient: this.db,
      handler: async tx => {
        const workspace = await tx.workspace.findUnique({ where: { id: principal.workspaceId } });
        if (!workspace) throw new NotFoundError('Workspace not found');
        if (workspace.revision !== input.expectedRevision) throw new ConflictError('Recovery batch policy changed. Reload the current workspace settings.', 'STALE_VERSION', true);
        const updated = await tx.workspace.update({ where: { id: workspace.id }, data: { recoveryBatchAtoms, revision: { increment: 1 } } });
        return {
          data: { revision: updated.revision, recoveryBatchAtoms: updated.recoveryBatchAtoms.toString() },
          aggregateType: 'WORKSPACE', aggregateId: workspace.id, previousVersion: workspace.revision, resourceVersion: updated.revision,
          auditDetails: { recoveryBatchAtoms: recoveryBatchAtoms.toString() },
        };
      },
    });
  }

  async listSubcontractPlans(principal: Principal) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'supplier.read', 'supplier.manage']);
    const plans = await this.db.recoverySubcontractPlan.findMany({
      where: { workspaceId: principal.workspaceId },
      include: { supplier: { select: { name: true, code: true } }, task: { select: { nodeKey: true, status: true, version: true } }, order: { select: { orderNumber: true } }, batches: { orderBy: { batchNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return plans.map(subcontractPlanDto);
  }

  async getSubcontractChoices(principal: Principal) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'supplier.read', 'supplier.manage']);
    const [tasks, suppliers, workspace] = await Promise.all([
      this.db.task.findMany({
        where: { workspaceId: principal.workspaceId, status: 'READY', targetAtoms: { gt: 0n }, assignedMachineId: null, assignedTechnicianId: null, instance: { status: 'ACTIVE', order: { status: { in: ['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'] } } }, recoverySubcontractPlans: { none: { status: { in: ['PROPOSED', 'SENT', 'IN_PROGRESS'] } } } },
        include: { instance: { include: { order: { select: { id: true, orderNumber: true } } } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100,
      }),
      this.db.supplier.findMany({ where: { workspaceId: principal.workspaceId, isActive: true, archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }], take: 200 }),
      this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { recoveryBatchAtoms: true } }),
    ]);
    return {
      tasks: tasks.map(task => ({ id: task.id, nodeKey: task.nodeKey, targetAtoms: task.targetAtoms.toString(), orderId: task.instance.order.id, orderNumber: task.instance.order.orderNumber })),
      suppliers,
      recoveryBatchAtoms: (workspace?.recoveryBatchAtoms ?? 0n).toString(),
    };
  }

  async getSubcontractPlan(principal: Principal, planId: string) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'supplier.read', 'supplier.manage']);
    const plan = await this.db.recoverySubcontractPlan.findFirst({
      where: { id: planId, workspaceId: principal.workspaceId },
      include: { supplier: { select: { name: true, code: true } }, task: { select: { nodeKey: true, status: true, version: true } }, order: { select: { orderNumber: true } }, batches: { orderBy: { batchNumber: 'asc' } } },
    });
    if (!plan) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
    return subcontractPlanDto(plan);
  }

  async createSubcontractPlan(principal: Principal, rawInput: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const input = CreateSubcontractPlanSchema.parse(rawInput);
    const [task, supplier, requester, workspace] = await Promise.all([
      this.db.task.findFirst({
        where: { id: input.taskId, workspaceId: principal.workspaceId, instance: { status: 'ACTIVE' } },
        include: { instance: { include: { order: { select: { id: true, itemId: true, version: true, status: true } } } } },
      }),
      this.db.supplier.findFirst({ where: { id: input.supplierId, workspaceId: principal.workspaceId, isActive: true, archivedAt: null }, select: { id: true } }),
      this.db.membership.findFirst({ where: { id: principal.membershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { supervisorMembershipId: true } }),
      this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { recoveryBatchAtoms: true } }),
    ]);
    if (!task) throw new NotFoundError(`Active task '${input.taskId}' not found`);
    if (!supplier) throw new NotFoundError(`Active supplier '${input.supplierId}' not found`);
    if (!requester?.supervisorMembershipId) throw new BadRequestError('Assign an active direct supervisor in People & Access before submitting subcontract recovery.');
    const approver = await this.db.membership.findFirst({ where: { id: requester.supervisorMembershipId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { id: true } });
    if (!approver) throw new ConflictError('The assigned supervisor is no longer active. Update the reporting line before submitting subcontract recovery.', 'APPROVER_UNAVAILABLE', true);
    if (!workspace || !['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(task.instance.order.status)) throw new BadRequestError('Subcontract recovery requires an active released order.');
    if (task.status !== 'READY' || task.assignedMachineId || task.assignedTechnicianId || task.targetAtoms <= 0n) throw new BadRequestError('Subcontract recovery requires a ready, unassigned operation with a positive target quantity.');
    const targetItemId = task.targetItemId ?? task.instance.order.itemId;
    const targetItem = await this.db.item.findFirst({ where: { workspaceId: principal.workspaceId, id: targetItemId }, select: { baseUom: { select: { precision: true } } } });
    if (!targetItem) throw new BadRequestError('Subcontract recovery needs a valid target item and unit precision.');
    const activePlan = await this.db.recoverySubcontractPlan.findFirst({ where: { workspaceId: principal.workspaceId, taskId: task.id, status: { in: ['PROPOSED', 'SENT', 'IN_PROGRESS'] } }, select: { id: true } });
    if (activePlan) throw new ConflictError('This operation already has an open subcontract plan.', 'SUBCONTRACT_ALREADY_OPEN', false);
    const batchLimitAtoms = workspace.recoveryBatchAtoms > 0n ? workspace.recoveryBatchAtoms : task.targetAtoms;
    const quantityPrecisionAtoms = 10n ** BigInt(6 - targetItem.baseUom.precision);
    if (batchLimitAtoms % quantityPrecisionAtoms !== 0n) {
      throw new BadRequestError(`Configured subcontract batch size must align with the target item's ${targetItem.baseUom.precision}-decimal unit precision.`);
    }
    const quantities: bigint[] = [];
    for (let remaining = task.targetAtoms; remaining > 0n;) {
      const quantity = remaining > batchLimitAtoms ? batchLimitAtoms : remaining;
      quantities.push(quantity);
      remaining -= quantity;
      if (quantities.length > 1000) throw new BadRequestError('Subcontract batch policy would create more than 1,000 batches. Increase the configured batch quantity.');
    }
    const planId = crypto.randomUUID();
    return executeCommand({
      principal, commandType: 'recovery.subcontract.create', idempotencyKey,
      payload: { ...input, taskVersion: task.version, orderVersion: task.instance.order.version }, prismaClient: this.db,
      handler: async tx => {
        const currentTask = await tx.task.findFirst({ where: { id: task.id, workspaceId: principal.workspaceId, instanceId: task.instanceId, version: task.version, status: 'READY', assignedMachineId: null, assignedTechnicianId: null }, select: { id: true } });
        if (!currentTask) throw new ConflictError('The operation changed before its subcontract proposal was saved.', 'STALE_VERSION', true);
        const created = await tx.recoverySubcontractPlan.create({ data: {
          id: planId, workspaceId: principal.workspaceId, orderId: task.instance.order.id, taskId: task.id, supplierId: supplier.id,
          taskVersion: task.version, orderVersion: task.instance.order.version, plannedAtoms: task.targetAtoms, batchLimitAtoms,
          status: 'PROPOSED', proposedById: principal.userId, approverMembershipId: approver.id, notes: input.notes,
          batches: { create: quantities.map((quantityAtoms, index) => ({ batchNumber: index + 1, quantityAtoms, status: 'PLANNED' })) },
        }, include: { supplier: { select: { name: true, code: true } }, task: { select: { nodeKey: true, status: true, version: true } }, order: { select: { orderNumber: true } }, batches: { orderBy: { batchNumber: 'asc' } } } });
        const data = subcontractPlanDto(created);
        return { data, aggregateType: 'RECOVERY_SUBCONTRACT', aggregateId: created.id, resourceVersion: created.version, auditDetails: { taskId: task.id, supplierId: supplier.id, plannedAtoms: task.targetAtoms.toString(), batchCount: quantities.length } };
      },
    });
  }

  async approveSubcontractPlan(principal: Principal, planId: string, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    return executeCommand({
      principal, commandType: 'recovery.subcontract.approve', idempotencyKey, payload: { planId }, prismaClient: this.db,
      handler: async tx => {
        const plan = await tx.recoverySubcontractPlan.findFirst({ where: { id: planId, workspaceId: principal.workspaceId }, include: { batches: { orderBy: { batchNumber: 'asc' } }, task: { select: { id: true, instanceId: true, nodeKey: true, status: true, version: true, assignedMachineId: true, assignedTechnicianId: true, targetAtoms: true } }, order: { select: { version: true, status: true } } } });
        if (!plan) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (plan.approverMembershipId !== principal.membershipId) throw new BadRequestError('Only the direct supervisor captured on this subcontract request can approve it.');
        const approver = await tx.membership.findFirst({ where: { id: plan.approverMembershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { id: true } });
        if (!approver) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (plan.status !== 'PROPOSED') throw new BadRequestError(`Subcontract plan is already ${plan.status.toLowerCase()}.`);
        if (plan.order.version !== plan.orderVersion || ['DELIVERED', 'CANCELLED'].includes(plan.order.status)) throw new ConflictError('The order changed or closed after subcontract review.', 'STALE_VERSION', true);
        if (plan.task.version !== plan.taskVersion || plan.task.status !== 'READY' || plan.task.assignedMachineId || plan.task.assignedTechnicianId || plan.task.targetAtoms !== plan.plannedAtoms) throw new ConflictError('The operation changed after subcontract review. Generate a new subcontract plan.', 'STALE_VERSION', true);
        const updatedTask = await tx.task.updateMany({ where: { id: plan.task.id, workspaceId: principal.workspaceId, version: plan.taskVersion, status: 'READY' }, data: { status: 'BLOCKED', version: { increment: 1 } } });
        if (updatedTask.count !== 1) throw new ConflictError('The operation changed during subcontract approval.', 'STALE_VERSION', true);
        await tx.recoverySubcontractPlan.update({ where: { id: plan.id }, data: { status: 'SENT', approvedById: principal.userId, approvedAt: new Date(), version: { increment: 1 } } });
        await tx.recoverySubcontractBatch.updateMany({ where: { workspaceId: principal.workspaceId, planId: plan.id, status: 'PLANNED' }, data: { status: 'SENT', sentAt: new Date() } });
        await tx.workflowEvent.create({ data: { workspaceId: principal.workspaceId, instanceId: plan.task.instanceId, taskId: plan.task.id, fromStatus: 'READY', toStatus: 'BLOCKED', action: 'SUBCONTRACT_SENT', actorUserId: principal.userId, detailJson: JSON.stringify({ subcontractPlanId: plan.id, supplierId: plan.supplierId, batchCount: plan.batches.length, plannedAtoms: plan.plannedAtoms.toString() }) } });
        const full = await tx.recoverySubcontractPlan.findFirstOrThrow({ where: { id: plan.id }, include: { supplier: { select: { name: true, code: true } }, task: { select: { nodeKey: true, status: true, version: true } }, order: { select: { orderNumber: true } }, batches: { orderBy: { batchNumber: 'asc' } } } });
        const data = subcontractPlanDto(full);
        return { data, aggregateType: 'RECOVERY_SUBCONTRACT', aggregateId: plan.id, resourceVersion: full.version, auditDetails: { taskId: plan.taskId, status: 'SENT', batchCount: plan.batches.length } };
      },
    });
  }

  async updateSubcontractBatchStatus(principal: Principal, planId: string, batchId: string, rawInput: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign', 'supplier.manage']);
    const input = SubcontractBatchStatusSchema.parse(rawInput);
    return executeCommand({
      principal, commandType: 'recovery.subcontract.batch-status', idempotencyKey, payload: { planId, batchId, ...input }, prismaClient: this.db,
      handler: async tx => {
        const plan = await tx.recoverySubcontractPlan.findFirst({ where: { id: planId, workspaceId: principal.workspaceId }, include: { task: { select: { nodeKey: true, instanceId: true } } } });
        if (!plan) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (!['SENT', 'IN_PROGRESS'].includes(plan.status)) throw new BadRequestError('Only a sent subcontract can be marked in progress.');
        const batch = await tx.recoverySubcontractBatch.findFirst({ where: { id: batchId, planId, workspaceId: principal.workspaceId } });
        if (!batch) throw new NotFoundError(`Subcontract batch '${batchId}' not found`);
        if (!['SENT', 'IN_PROGRESS', 'PARTIALLY_RETURNED'].includes(batch.status)) throw new BadRequestError('This subcontract batch cannot enter progress from its current state.');
        await tx.recoverySubcontractBatch.update({ where: { id: batch.id }, data: { status: 'IN_PROGRESS', ...(input.vendorReference ? { vendorReference: input.vendorReference } : {}) } });
        await tx.recoverySubcontractPlan.update({ where: { id: plan.id }, data: { status: 'IN_PROGRESS', version: { increment: 1 } } });
        const updated = await tx.recoverySubcontractBatch.findUniqueOrThrow({ where: { id: batch.id } });
        return { data: { id: updated.id, status: updated.status, vendorReference: updated.vendorReference }, aggregateType: 'RECOVERY_SUBCONTRACT', aggregateId: plan.id, resourceVersion: plan.version + 1, auditDetails: { batchId, status: updated.status, vendorReference: updated.vendorReference } };
      },
    });
  }

  async returnSubcontractBatch(principal: Principal, planId: string, batchId: string, rawInput: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign', 'supplier.manage']);
    const input = ReturnSubcontractBatchSchema.parse(rawInput);
    const returnedAtoms = BigInt(input.returnedAtoms);
    return executeCommand({
      principal, commandType: 'recovery.subcontract.batch-return', idempotencyKey, payload: { planId, batchId, ...input }, prismaClient: this.db,
      handler: async tx => {
        const plan = await tx.recoverySubcontractPlan.findFirst({ where: { id: planId, workspaceId: principal.workspaceId }, include: { task: { select: { id: true, instanceId: true, nodeKey: true, status: true, version: true } }, batches: true } });
        if (!plan) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (!['SENT', 'IN_PROGRESS'].includes(plan.status)) throw new BadRequestError('Only an active subcontract can receive returned quantity.');
        const batch = plan.batches.find((item: { id: string }) => item.id === batchId);
        if (!batch) throw new NotFoundError(`Subcontract batch '${batchId}' not found`);
        if (!['IN_PROGRESS', 'PARTIALLY_RETURNED'].includes(batch.status)) throw new BadRequestError('Mark the vendor batch in progress before recording a return.');
        if (returnedAtoms > batch.quantityAtoms - batch.returnedAtoms) throw new BadRequestError('Returned quantity exceeds the remaining quantity for this vendor batch.');
        const newReturnedAtoms = batch.returnedAtoms + returnedAtoms;
        const batchStatus = newReturnedAtoms === batch.quantityAtoms ? 'RETURNED' : 'PARTIALLY_RETURNED';
        await tx.recoverySubcontractBatch.update({ where: { id: batch.id }, data: { returnedAtoms: newReturnedAtoms, status: batchStatus, ...(input.vendorReference ? { vendorReference: input.vendorReference } : {}), ...(batchStatus === 'RETURNED' ? { returnedAt: new Date() } : {}) } });
        const totalReturned = plan.batches.reduce((sum: bigint, item: { returnedAtoms: bigint }) => sum + item.returnedAtoms, 0n) + returnedAtoms;
        const planReturned = totalReturned === plan.plannedAtoms;
        const planStatus = planReturned ? 'RETURNED' : 'IN_PROGRESS';
        await tx.recoverySubcontractPlan.update({ where: { id: plan.id }, data: { status: planStatus, ...(planReturned ? { returnedAt: new Date() } : {}), version: { increment: 1 } } });
        if (planReturned) {
          const resumed = await tx.task.updateMany({ where: { id: plan.task.id, workspaceId: principal.workspaceId, version: plan.task.version, status: 'BLOCKED' }, data: { status: 'READY', version: { increment: 1 } } });
          if (resumed.count !== 1) throw new ConflictError('The operation cannot return to internal flow because its state changed.', 'STALE_VERSION', true);
          await tx.workflowEvent.create({ data: { workspaceId: principal.workspaceId, instanceId: plan.task.instanceId, taskId: plan.task.id, fromStatus: 'BLOCKED', toStatus: 'READY', action: 'SUBCONTRACT_RETURNED_TO_INTERNAL_FLOW', actorUserId: principal.userId, detailJson: JSON.stringify({ subcontractPlanId: plan.id, supplierId: plan.supplierId, returnedAtoms: totalReturned.toString() }) } });
        }
        return { data: { planId: plan.id, batchId, batchStatus, planStatus, returnedAtoms: totalReturned.toString(), plannedAtoms: plan.plannedAtoms.toString() }, aggregateType: 'RECOVERY_SUBCONTRACT', aggregateId: plan.id, resourceVersion: plan.version + 1, auditDetails: { batchId, batchStatus, planStatus, returnedAtoms: totalReturned.toString() } };
      },
    });
  }

  async rejectSubcontractPlan(principal: Principal, planId: string, note: string, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const rejectionNote = z.string().trim().min(1).max(1000).parse(note);
    return executeCommand({
      principal, commandType: 'recovery.subcontract.reject', idempotencyKey, payload: { planId, note: rejectionNote }, prismaClient: this.db,
      handler: async tx => {
        const plan = await tx.recoverySubcontractPlan.findFirst({ where: { id: planId, workspaceId: principal.workspaceId } });
        if (!plan) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (plan.approverMembershipId !== principal.membershipId) throw new BadRequestError('Only the direct supervisor captured on this subcontract request can reject it.');
        const approver = await tx.membership.findFirst({ where: { id: plan.approverMembershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { id: true } });
        if (!approver) throw new NotFoundError(`Subcontract plan '${planId}' not found`);
        if (plan.status !== 'PROPOSED') throw new BadRequestError('Only a proposed subcontract plan can be rejected.');
        const updated = await tx.recoverySubcontractPlan.update({ where: { id: plan.id }, data: { status: 'REJECTED', notes: `${plan.notes ? `${plan.notes}\n` : ''}Rejected: ${rejectionNote}`, version: { increment: 1 } } });
        return { data: { id: updated.id, status: updated.status, version: updated.version }, aggregateType: 'RECOVERY_SUBCONTRACT', aggregateId: plan.id, resourceVersion: updated.version, auditDetails: { status: 'REJECTED', note: rejectionNote } };
      },
    });
  }

  /** Apply only the exact reviewed assignments, after current transactional revalidation. */
  async applyScheduleReview(principal: Principal, proposalId: string, idempotencyKey: string, rawSelection?: unknown) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const selection = ApplyScheduleReviewSchema.parse(rawSelection ?? {});
    const payload = { proposalId, optionId: selection.optionId ?? 'BASELINE' };
    return executeCommand({
      principal,
      commandType: 'recovery.schedule-review.apply',
      idempotencyKey,
      payload,
      prismaClient: this.db,
      handler: async (tx: Prisma.TransactionClient) => {
        const row = await tx.recoveryProposal.findFirst({
          where: { id: proposalId, workspaceId: principal.workspaceId },
          include: { order: { select: { id: true, version: true, status: true, facilityId: true } } },
        });
        if (!row) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
        const grantedFacilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
        if (row.order.facilityId && !grantedFacilityIds.includes(row.order.facilityId)) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
        if (row.status !== 'PROPOSED') throw new BadRequestError('Only an open recovery proposal can be applied.');
        if (row.order.status === 'DELIVERED' || row.order.status === 'CANCELLED') throw new BadRequestError(`Cannot apply recovery for order in status ${row.order.status}.`);
        if (row.order.version !== row.orderVersion) throw new ConflictError('The order changed after this schedule was reviewed. Generate a fresh proposal.', 'STALE_VERSION', true);
        const proposal = parseSavedProposal(row.proposalJson);
        const snapshot = proposal?.mode === 'SCHEDULE_REVIEW' ? proposal.scheduleReview : null;
        if (!proposal || !snapshot || !snapshot.tasks.length) throw new BadRequestError('Only a complete schedule review can be applied.');
        const chosenAlternative = selection.optionId ? snapshot.alternatives?.find(option => option.id === selection.optionId) : null;
        const chosenOvertimeAlternative = selection.optionId ? snapshot.overtimeAlternatives?.find(option => option.id === selection.optionId) : null;
        if (selection.optionId && !chosenAlternative && !chosenOvertimeAlternative) throw new BadRequestError('The selected schedule alternative is not part of this recovery proposal.');
        const requiredApproverMembershipId = chosenOvertimeAlternative?.approverMembershipId ?? row.approverMembershipId;
        if (!requiredApproverMembershipId || requiredApproverMembershipId !== principal.membershipId) {
          throw new BadRequestError(chosenOvertimeAlternative ? 'Only the affected technician direct supervisor captured on this overtime scenario can approve it.' : 'Only the direct supervisor captured when this Recovery proposal was submitted can approve it.');
        }
        const approver = await tx.membership.findFirst({ where: { id: requiredApproverMembershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { id: true } });
        if (!approver) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
        const appliedTasks = chosenOvertimeAlternative?.tasks ?? chosenAlternative?.tasks ?? snapshot.tasks;
        if (!row.order.facilityId || snapshot.facilityId !== row.order.facilityId) {
          throw new ConflictError('The order facility changed or is missing from the reviewed schedule. Generate a fresh recovery schedule.', 'STALE_SCOPE', true);
        }
        if (appliedTasks.some((task) => !task.startAt || !task.endAt || task.technicianId === undefined || task.machineId === undefined)) {
          throw new ConflictError('This saved review predates assignment evidence. Generate a fresh schedule review before applying.', 'STALE_SCHEDULE', true);
        }
        const instance = await tx.workflowInstance.findFirst({
          where: { workspaceId: principal.workspaceId, id: snapshot.instanceId, orderId: row.orderId, status: 'ACTIVE' },
          select: { id: true, workflowVersionId: true, engineeringRevisionId: true },
        });
        if (!instance || instance.workflowVersionId !== snapshot.workflowVersionId || instance.engineeringRevisionId !== snapshot.engineeringRevisionId) {
          throw new ConflictError('The active job, workflow, or engineering revision changed after review.', 'STALE_SCHEDULE', true);
        }
        const taskIds = appliedTasks.map(({ taskId }) => taskId);
        const openTaskIds = await tx.task.findMany({
          where: { workspaceId: principal.workspaceId, instanceId: instance.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: { id: true },
        });
        if (openTaskIds.length !== taskIds.length || openTaskIds.some(({ id }) => !taskIds.includes(id))) {
          throw new ConflictError('The active job task set changed after this schedule was reviewed.', 'STALE_SCHEDULE', true);
        }
        const currentTasks = await tx.task.findMany({
          where: { workspaceId: principal.workspaceId, id: { in: taskIds }, instanceId: instance.id },
          include: { predecessorDeps: { include: { predecessor: { select: { id: true, status: true } } } }, demands: { include: { reservations: true } } },
        });
        if (currentTasks.length !== appliedTasks.length || appliedTasks.some((saved) => currentTasks.find((task) => task.id === saved.taskId)?.version !== saved.version)) {
          throw new ConflictError('One or more tasks changed after this schedule was reviewed.', 'STALE_VERSION', true);
        }
        const claimed = await tx.recoveryProposal.updateMany({
          where: { workspaceId: principal.workspaceId, id: row.id, status: 'PROPOSED', orderVersion: row.orderVersion },
          data: { status: 'APPLYING' },
        });
        if (claimed.count !== 1) {
          throw new ConflictError('This recovery proposal is already being applied or has been resolved. Refresh the proposal before retrying.', 'STALE_PROPOSAL', true);
        }
        if (chosenOvertimeAlternative) {
          const intervalStart = new Date(chosenOvertimeAlternative.startAt);
          const intervalEnd = new Date(chosenOvertimeAlternative.endAt);
          const [workspace, technician, technicianMembership, existingOvertime, existingBooking, exclusion] = await Promise.all([
            tx.workspace.findUnique({ where: { id: principal.workspaceId }, select: { timezone: true, maxOvertimeMinutesPerDay: true, maxOvertimeMinutesPerWeek: true } }),
            tx.technician.findFirst({ where: { id: chosenOvertimeAlternative.technicianId, workspaceId: principal.workspaceId, isActive: true, archivedAt: null }, select: { id: true, facilityId: true } }),
            tx.membership.findFirst({ where: { workspaceId: principal.workspaceId, technicianId: chosenOvertimeAlternative.technicianId, status: 'ACTIVE' }, select: { supervisorMembershipId: true } }),
            tx.rosterInterval.findMany({ where: { workspaceId: principal.workspaceId, technicianId: chosenOvertimeAlternative.technicianId, intervalType: 'OVERTIME', status: { in: ['DRAFT', 'PUBLISHED'] }, startAt: { lt: intervalEnd }, endAt: { gt: intervalStart } }, select: { startAt: true, endAt: true } }),
            tx.resourceBooking.findFirst({ where: { workspaceId: principal.workspaceId, resourceType: 'TECHNICIAN', resourceId: chosenOvertimeAlternative.technicianId, status: 'CONFIRMED', startAt: { lt: intervalEnd }, endAt: { gt: intervalStart } }, select: { id: true } }),
            tx.rosterInterval.findFirst({ where: { workspaceId: principal.workspaceId, technicianId: chosenOvertimeAlternative.technicianId, intervalType: { in: ['LEAVE', 'TRAINING', 'HOLIDAY'] }, status: 'PUBLISHED', startAt: { lt: intervalEnd }, endAt: { gt: intervalStart } }, select: { id: true } }),
          ]);
          if (!workspace || !technician || technicianMembership?.supervisorMembershipId !== chosenOvertimeAlternative.approverMembershipId) throw new ConflictError('The overtime approver or technician is no longer current. Generate a fresh recovery proposal.', 'STALE_APPROVER', true);
          if (existingOvertime.length || existingBooking || exclusion) throw new ConflictError('The proposed overtime interval now conflicts with an existing interval or booking.', 'STALE_CAPACITY', true);
          const totals = accumulateOvertimeMinutes([...existingOvertime, { startAt: intervalStart, endAt: intervalEnd }], workspace.timezone);
          if ([...totals.byDay.values()].some(value => value > workspace.maxOvertimeMinutesPerDay) || [...totals.byWeek.values()].some(value => value > workspace.maxOvertimeMinutesPerWeek)) throw new ConflictError('The proposed overtime now exceeds the workspace daily or weekly policy.', 'OVERTIME_POLICY', true);
          await tx.rosterInterval.create({ data: {
            workspaceId: principal.workspaceId, facilityId: technician.facilityId, technicianId: technician.id,
            intervalType: 'OVERTIME', startAt: intervalStart, endAt: intervalEnd, status: 'PUBLISHED',
            approverMembershipId: approver.id, notes: `Approved with Recovery proposal ${proposalId}`,
          } });
        }
        const savedById = new Map(appliedTasks.map((task) => [task.taskId, task]));
        const applied: string[] = [];
        for (const saved of appliedTasks) {
          const task = currentTasks.find((candidate) => candidate.id === saved.taskId)!;
          if (!saved.startAt || !saved.endAt) throw new ConflictError(`Task ${saved.nodeKey} has no reviewed schedule window.`, 'STALE_SCHEDULE', true);
          if (new Date(saved.startAt).getTime() < Date.now()) throw new ConflictError(`The reviewed time window for ${saved.nodeKey} has already started. Generate a fresh recovery schedule.`, 'STALE_SCHEDULE', true);
          if (!['PENDING', 'READY'].includes(task.status)) throw new ConflictError(`Task ${task.nodeKey} is no longer eligible for a new assignment.`, 'STALE_SCHEDULE', true);
          for (const dependency of task.predecessorDeps) {
            if (dependency.predecessor.status === 'COMPLETED') continue;
            const predecessor = savedById.get(dependency.predecessor.id);
            if (!predecessor?.endAt || !saved.startAt || new Date(predecessor.endAt).getTime() > new Date(saved.startAt).getTime()) {
              throw new ConflictError(`Task ${task.nodeKey} no longer follows its current predecessor dependencies.`, 'STALE_SCHEDULE', true);
            }
          }
          for (const demand of task.demands) {
            if (demand.status === 'ISSUED') continue;
            const reserved = demand.reservations.filter((reservation) => reservation.status === 'ACTIVE').reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
            if (reserved < demand.requiredAtoms) throw new ConflictError(`Material demand for task ${task.nodeKey} is no longer fully reserved or issued.`, 'MATERIAL_NOT_READY', true);
          }
          const evaluation = await this.planning.evaluateAssignmentInTransaction(tx, principal, {
            taskId: task.id,
            technicianId: saved.technicianId,
            machineId: saved.machineId,
            scheduledStartAt: saved.startAt,
            scheduledEndAt: saved.endAt,
          });
          if (!evaluation.isEligible) throw new ConflictError(`Assignment for ${task.nodeKey} is no longer eligible: ${evaluation.violations.join('; ')}`, 'STALE_CAPACITY', true);
          const updated = await tx.task.updateMany({
            where: { workspaceId: principal.workspaceId, id: task.id, version: saved.version, status: { in: ['PENDING', 'READY'] } },
            data: { assignedTechnicianId: saved.technicianId, assignedMachineId: saved.machineId, status: 'ASSIGNED', version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ConflictError(`Task ${task.nodeKey} changed during schedule application.`, 'STALE_VERSION', true);
          const bookings = [
            ...(saved.technicianId ? [{ resourceType: 'TECHNICIAN' as const, resourceId: saved.technicianId, startAt: new Date(saved.startAt), endAt: new Date(saved.endAt) }] : []),
            ...(saved.machineId ? [{ resourceType: 'MACHINE' as const, resourceId: saved.machineId, startAt: new Date(saved.startAt), endAt: new Date(saved.endAt) }] : []),
          ];
          await this.planning.replaceBookingsInTransaction(tx, principal.workspaceId, task.id, bookings);
          await tx.workflowEvent.create({ data: {
            workspaceId: principal.workspaceId, instanceId: task.instanceId, taskId: task.id,
            fromStatus: task.status, toStatus: 'ASSIGNED', action: 'RECOVERY_SCHEDULE_APPLY', actorUserId: principal.userId,
            detailJson: JSON.stringify({ recoveryProposalId: proposalId, optionId: payload.optionId, startAt: saved.startAt, endAt: saved.endAt, technicianId: saved.technicianId, machineId: saved.machineId }),
          } });
          applied.push(task.id);
        }
        const updatedProposal = await tx.recoveryProposal.update({
          where: { id: row.id },
          data: { status: 'APPROVED', resolvedById: principal.userId, resolvedAt: new Date(), resolutionNote: `Applied ${applied.length} reviewed task assignments.` },
        });
        return {
          data: { proposalId: updatedProposal.id, status: updatedProposal.status, appliedTaskIds: applied },
          aggregateType: 'RECOVERY_PROPOSAL', aggregateId: updatedProposal.id, resourceVersion: 1,
          auditDetails: { mode: 'SCHEDULE_REVIEW', optionId: payload.optionId, overtimeInterval: chosenOvertimeAlternative ? { technicianId: chosenOvertimeAlternative.technicianId, startAt: chosenOvertimeAlternative.startAt, endAt: chosenOvertimeAlternative.endAt } : undefined, appliedTaskCount: applied.length, taskIds: applied },
        };
      },
    });
  }

  /**
   * Generates realistic, constraint-checked recovery plan alternatives for an affected order.
   */
  async proposeRecovery(
    principal: Principal,
    rawInput: unknown
  ): Promise<RecoveryProposalDTO> {
    requireAnyPermission(principal, [
      'planning.read',
      'planning.write',
      'order.read',
    ]);

    const input: ProposeRecoveryInput = ProposeRecoverySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const order = await this.db.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
      include: {
        item: true,
        lines: true,
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    productionOutputs: {
                      include: {
                        inspections: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found`);
    }

    // Compute actual ready QC-passed quantity from inspection records
    let passedAtoms = 0n;
    for (const mo of order.manufacturingOrders) {
      for (const js of mo.jobsheets) {
        for (const task of js.tasks) {
          for (const out of task.productionOutputs) {
            // Recovery is a customer-delivery decision. Intermediate-operation QC
            // does not represent finished goods that can be promised for shipment.
            if (!out.isFinal) continue;
            for (const insp of out.inspections) {
              if (insp.status === 'FINALIZED') {
                passedAtoms += insp.passedAtoms;
              }
            }
          }
        }
      }
    }

    if (order.lines.length > 1) {
      throw new BadRequestError(
        'Recovery proposals currently support single-line orders only; per-line schedule and shipment allocation is required for multi-line orders.'
      );
    }
    if (passedAtoms % 1_000_000n !== 0n || order.orderedAtoms % 1_000_000n !== 0n) {
      throw new BadRequestError(
        'Recovery proposals currently support whole-unit quantities only; fractional quantities cannot be represented safely by this simulator.'
      );
    }
    const readyQtyAtoms = passedAtoms / 1_000_000n;
    const totalQtyAtoms = order.orderedAtoms / 1_000_000n;
    if (readyQtyAtoms > BigInt(Number.MAX_SAFE_INTEGER) || totalQtyAtoms > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestError('Order quantities exceed the safe range supported by this recovery simulator.');
    }
    if (readyQtyAtoms > totalQtyAtoms) {
      throw new BadRequestError('Final QC-passed quantity cannot exceed the order quantity. Reconcile QC evidence before proposing recovery.');
    }
    const readyQcPassedQty = Number(readyQtyAtoms);
    const totalQty = Number(totalQtyAtoms);
    const originalPromisedDate = order.promisedDate
      ? order.promisedDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const projectedDelayedDate = addWorkDays(
      originalPromisedDate,
      input.delayDays,
      DEFAULT_CALENDAR
    );

    const materialArrivesDate =
      input.materialArrivesDate ||
      addWorkDays(originalPromisedDate, Math.max(1, input.delayDays - 1), DEFAULT_CALENDAR);

    const options = generateRecoveryOptions({
      orderId: order.id,
      totalQty,
      readyQcPassedQty,
      disruptionType: input.disruptionType,
      materialArrivesDate,
      originalPromisedDate,
      projectedDelayedDate,
    });

    const proposalId = crypto.randomUUID();
    const proposal: RecoveryProposalDTO = {
      id: proposalId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalQty,
      readyQcPassedQty,
      originalPromisedDate,
      projectedDelayedDate,
      options,
      createdAt: new Date().toISOString(),
    };

    await this.db.recoveryProposal.create({
      data: {
        id: proposalId,
        workspaceId,
        orderId: order.id,
        orderVersion: order.version,
        proposalJson: JSON.stringify(proposal),
      },
    });
    return proposal;
  }

  /**
   * Commits an atomic recovery decision (e.g. split batch delivery promise),
   * updating order promised date/tranches and creating audit trails without fabricating fake production.
   */
  async approveRecovery(
    principal: Principal,
    rawInput: unknown,
    _idempotencyKey?: string
  ) {
    requireAnyPermission(principal, [
      'planning.write',
      'order.release',
      'order.create',
    ]);

    const input: ApproveRecoveryInput = ApproveRecoverySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // Validate order status first
    const preOrder = await this.db.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
    });

    if (!preOrder) {
      throw new NotFoundError(`Order '${input.orderId}' not found for recovery approval`);
    }

    if (preOrder.status === 'DELIVERED' || preOrder.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot approve recovery for order in status ${preOrder.status}`);
    }

    // Resolve and re-validate persisted recovery proposal
    const persistedProposal = await this.db.recoveryProposal.findFirst({
      where: { id: input.proposalId, workspaceId, orderId: input.orderId },
    });
    if (!persistedProposal) {
      throw new NotFoundError(`Recovery proposal '${input.proposalId}' not found or expired`);
    }
    if (persistedProposal.status !== 'PROPOSED') {
      throw new BadRequestError(`Recovery proposal '${input.proposalId}' is already ${persistedProposal.status.toLowerCase()}`);
    }
    if (persistedProposal.orderVersion !== preOrder.version) {
      throw new BadRequestError(
        `Recovery proposal '${input.proposalId}' is stale because order '${input.orderId}' changed after it was generated.`
      );
    }
    const proposal = JSON.parse(persistedProposal.proposalJson) as RecoveryProposalDTO;
    if (proposal.orderId !== input.orderId) {
      throw new BadRequestError(`Recovery proposal does not match order '${input.orderId}'`);
    }

    const chosenOption = proposal.options.find((o) => o.id === input.optionId);
    if (!chosenOption) {
      throw new NotFoundError(`Option '${input.optionId}' not found in recovery proposal`);
    }
    if (!chosenOption.feasible) {
      throw new BadRequestError(
        `Cannot approve infeasible recovery option: ${chosenOption.infeasibleReason || 'Option is not feasible'}`
      );
    }

    if (!chosenOption.allocation) {
      throw new BadRequestError(`Recovery option '${input.optionId}' has no persisted tranche allocation`);
    }
    if (
      input.tranche1Qty !== chosenOption.allocation.tranche1Qty ||
      input.tranche1Date !== chosenOption.allocation.tranche1Date ||
      (input.tranche2Qty ?? 0) !== chosenOption.allocation.tranche2Qty ||
      (input.tranche2Date ?? '') !== chosenOption.allocation.tranche2Date
    ) {
      throw new BadRequestError('Approved recovery tranches must exactly match the selected persisted option.');
    }

    const totalTranches = input.tranche1Qty + (input.tranche2Qty || 0);
    if (totalTranches !== proposal.totalQty) {
      throw new BadRequestError(
        `Recovery tranches must strictly conserve total ordered quantity (${proposal.totalQty}), but got ${totalTranches}`
      );
    }

    throw new BadRequestError(
      `Recovery proposal '${proposal.id}' is saved for review, but it cannot be applied because this service does not yet create a schedule change or shipment reservation.`
    );
  }

  /**
   * Closes a proposal with an explicit REJECTED decision, recording the
   * responsible actor and reason. Approval stays gated on a service that
   * applies real schedule/shipment reservations (see approveRecovery).
   */
  async rejectProposal(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['planning.write', 'order.release']);

    const input = RejectProposalSchema.parse(rawInput);

    return executeCommand({
      principal,
      commandType: 'recovery.proposal.reject',
      idempotencyKey,
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const proposal = await tx.recoveryProposal.findFirst({
          where: { id: input.proposalId, workspaceId: principal.workspaceId },
        });
        if (!proposal) {
          throw new NotFoundError(`Recovery proposal '${input.proposalId}' not found`);
        }
        if (proposal.status !== 'PROPOSED') {
          throw new BadRequestError(
            `Recovery proposal '${proposal.id}' is already ${proposal.status.toLowerCase()}`
          );
        }
        if (!proposal.approverMembershipId || proposal.approverMembershipId !== principal.membershipId) {
          throw new BadRequestError('Only the direct supervisor captured when this Recovery proposal was submitted can reject it.');
        }
        const activeApprover = await tx.membership.findFirst({
          where: { id: proposal.approverMembershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!activeApprover) throw new NotFoundError(`Recovery proposal '${input.proposalId}' not found`);
        const updated = await tx.recoveryProposal.update({
          where: { id: proposal.id },
          data: {
            status: 'REJECTED',
            resolvedById: principal.userId,
            resolvedAt: new Date(),
            resolutionNote: input.note,
          },
        });
        return {
          data: updated,
          aggregateType: 'RECOVERY_PROPOSAL',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }
}
