import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { executeCommand, hashPayload } from '@/server/db/transaction';
import { z } from 'zod';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';
import { PlanningService } from '@/server/modules/planning/service';

const RejectProposalSchema = z.object({
  proposalId: z.string().uuid(),
  note: z.string().min(1).max(1000),
});
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
      evaluatedAt: z.string(), projectedEndAt: z.string(),
      machineCostEstimate: z.object({ status: z.enum(['COMPLETE', 'PARTIAL', 'NOT_AVAILABLE']), currency: z.string(), totalMinorUnits: z.number().int().nullable(), pricedTaskCount: z.number().int(), unpricedTaskCount: z.number().int() }).optional(),
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
    if (schedule.state !== 'COMPLETE' || !schedule.projectedEndAt) {
      const missingInputs = [...new Set([
        ...schedule.tasks.flatMap((task) => task.status === 'UNSCHEDULED' ? task.reasons : []),
        ...(schedule.state === 'NO_OPEN_TASKS' ? ['No open task remains for a recovery schedule review.'] : []),
      ])];
      return { state: 'NOT_CONNECTED', scheduleState: schedule.state, missingInputs };
    }

    const scheduledMachineIds = [...new Set(schedule.tasks.flatMap(task => task.machineId ? [task.machineId] : []))];
    const [costedMachines, workspace] = await Promise.all([
      scheduledMachineIds.length ? this.db.machine.findMany({ where: { workspaceId: principal.workspaceId, id: { in: scheduledMachineIds } }, select: { id: true, hourlyRateCents: true } }) : Promise.resolve([]),
      this.db.workspace.findUnique({ where: { id: principal.workspaceId }, select: { currency: true } }),
    ]);
    const machineRates = new Map(costedMachines.map(machine => [machine.id, machine.hourlyRateCents]));
    let costTotal = 0n;
    let pricedTaskCount = 0;
    let unpricedTaskCount = 0;
    for (const task of schedule.tasks) {
      if (!task.machineId) continue;
      const rate = machineRates.get(task.machineId);
      const durationMs = task.startAt && task.endAt ? BigInt(new Date(task.endAt).getTime() - new Date(task.startAt).getTime()) : 0n;
      if (rate === null || rate === undefined || durationMs <= 0n) { unpricedTaskCount += 1; continue; }
      costTotal += (BigInt(rate) * durationMs + 3_600_000n - 1n) / 3_600_000n;
      pricedTaskCount += 1;
    }
    const totalMinorUnits = costTotal <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(costTotal) : null;
    const machineCostEstimate = {
      status: !pricedTaskCount && !unpricedTaskCount ? 'NOT_AVAILABLE' as const : unpricedTaskCount || totalMinorUnits === null ? 'PARTIAL' as const : 'COMPLETE' as const,
      currency: workspace?.currency ?? 'UNKNOWN', totalMinorUnits, pricedTaskCount, unpricedTaskCount,
    };

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
        projectedEndAt: schedule.projectedEndAt,
        machineCostEstimate,
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
          'No shipment allocation, customer commitment, booking, or cost impact is included.',
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
    if (!proposal || !snapshot) throw new BadRequestError('Only schedule-grounded proposals can request a delivery-date review.');

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

  /** Apply only the exact reviewed assignments, after current transactional revalidation. */
  async applyScheduleReview(principal: Principal, proposalId: string, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const payload = { proposalId };
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
        if (!row.approverMembershipId || row.approverMembershipId !== principal.membershipId) {
          throw new BadRequestError('Only the direct supervisor captured when this Recovery proposal was submitted can approve it.');
        }
        const approver = await tx.membership.findFirst({ where: { id: row.approverMembershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE' }, select: { id: true } });
        if (!approver) throw new NotFoundError(`Recovery proposal '${proposalId}' not found`);
        if (row.status !== 'PROPOSED') throw new BadRequestError('Only an open recovery proposal can be applied.');
        if (row.order.status === 'DELIVERED' || row.order.status === 'CANCELLED') throw new BadRequestError(`Cannot apply recovery for order in status ${row.order.status}.`);
        if (row.order.version !== row.orderVersion) throw new ConflictError('The order changed after this schedule was reviewed. Generate a fresh proposal.', 'STALE_VERSION', true);
        const proposal = parseSavedProposal(row.proposalJson);
        const snapshot = proposal?.mode === 'SCHEDULE_REVIEW' ? proposal.scheduleReview : null;
        if (!proposal || !snapshot || !snapshot.tasks.length) throw new BadRequestError('Only a complete schedule review can be applied.');
        if (!row.order.facilityId || snapshot.facilityId !== row.order.facilityId) {
          throw new ConflictError('The order facility changed or is missing from the reviewed schedule. Generate a fresh recovery schedule.', 'STALE_SCOPE', true);
        }
        if (snapshot.tasks.some((task) => !task.startAt || !task.endAt || task.technicianId === undefined || task.machineId === undefined)) {
          throw new ConflictError('This saved review predates assignment evidence. Generate a fresh schedule review before applying.', 'STALE_SCHEDULE', true);
        }
        const instance = await tx.workflowInstance.findFirst({
          where: { workspaceId: principal.workspaceId, id: snapshot.instanceId, orderId: row.orderId, status: 'ACTIVE' },
          select: { id: true, workflowVersionId: true, engineeringRevisionId: true },
        });
        if (!instance || instance.workflowVersionId !== snapshot.workflowVersionId || instance.engineeringRevisionId !== snapshot.engineeringRevisionId) {
          throw new ConflictError('The active job, workflow, or engineering revision changed after review.', 'STALE_SCHEDULE', true);
        }
        const taskIds = snapshot.tasks.map(({ taskId }) => taskId);
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
        if (currentTasks.length !== snapshot.tasks.length || snapshot.tasks.some((saved) => currentTasks.find((task) => task.id === saved.taskId)?.version !== saved.version)) {
          throw new ConflictError('One or more tasks changed after this schedule was reviewed.', 'STALE_VERSION', true);
        }
        const claimed = await tx.recoveryProposal.updateMany({
          where: { workspaceId: principal.workspaceId, id: row.id, status: 'PROPOSED', orderVersion: row.orderVersion },
          data: { status: 'APPLYING' },
        });
        if (claimed.count !== 1) {
          throw new ConflictError('This recovery proposal is already being applied or has been resolved. Refresh the proposal before retrying.', 'STALE_PROPOSAL', true);
        }
        const savedById = new Map(snapshot.tasks.map((task) => [task.taskId, task]));
        const applied: string[] = [];
        for (const saved of snapshot.tasks) {
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
            detailJson: JSON.stringify({ recoveryProposalId: proposalId, startAt: saved.startAt, endAt: saved.endAt, technicianId: saved.technicianId, machineId: saved.machineId }),
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
          auditDetails: { mode: 'SCHEDULE_REVIEW', appliedTaskCount: applied.length, taskIds: applied },
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
