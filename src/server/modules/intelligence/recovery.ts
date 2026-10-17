import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { executeCommand, hashPayload } from '@/server/db/transaction';
import { z } from 'zod';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';

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
      taskVersions: z.array(z.object({ taskId: z.string(), version: z.number().int() })),
      tasks: z.array(z.object({
        taskId: z.string(), version: z.number().int(), nodeKey: z.string(), startAt: z.string().nullable(), endAt: z.string().nullable(),
        technicianName: z.string().nullable(), machineName: z.string().nullable(), predecessorTaskIds: z.array(z.string()),
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

  constructor(private readonly db: PrismaClient) {
    this.scheduleProposals = new ScheduleProposalService(db);
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
      startHorizon: new Date().toISOString(),
      horizonDays: 30,
    });
    if (schedule.state !== 'COMPLETE' || !schedule.projectedEndAt) {
      const missingInputs = [...new Set([
        ...schedule.tasks.flatMap((task) => task.status === 'UNSCHEDULED' ? task.reasons : []),
        ...(schedule.state === 'NO_OPEN_TASKS' ? ['No open task remains for a recovery schedule review.'] : []),
      ])];
      return { state: 'NOT_CONNECTED', scheduleState: schedule.state, missingInputs };
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
        projectedEndAt: schedule.projectedEndAt,
        taskVersions: schedule.tasks.map(({ taskId, version }) => ({ taskId, version })),
        tasks: schedule.tasks.map((task) => ({
          taskId: task.taskId, version: task.version, nodeKey: task.nodeKey,
          startAt: task.startAt, endAt: task.endAt,
          technicianName: task.technicianName, machineName: task.machineName,
          predecessorTaskIds: task.predecessorTaskIds,
        })),
        assumptions: [
          ...schedule.assumptions,
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
      handler: async (tx) => {
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
            orderVersion: order.version, proposedById: principal.userId, proposalJson: JSON.stringify(proposal),
          },
        });
        return {
          data: proposal, aggregateType: 'RECOVERY_PROPOSAL', aggregateId: proposalId, resourceVersion: 1,
          auditDetails: { mode: 'SCHEDULE_REVIEW', instanceId: input.instanceId, taskCount: taskVersions.length, scheduleState: schedule.state },
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
        include: { order: { select: { id: true, orderNumber: true, status: true } } },
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
      proposal: parseSavedProposal(row.proposalJson),
    }));
    return { items, page: query.page, pageSize: query.pageSize, total, pageCount: Math.ceil(total / query.pageSize) };
  }

  async getProposal(principal: Principal, proposalId: string): Promise<RecoveryListItem> {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign', 'order.read']);
    const row = await this.db.recoveryProposal.findFirst({
      where: { id: proposalId, workspaceId: principal.workspaceId },
      include: { order: { select: { id: true, orderNumber: true, status: true } } },
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
      proposal: parseSavedProposal(row.proposalJson),
    };
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
