import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BadRequestError } from '@/domain/errors';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';
import { EvaluatePromiseInput, EvaluatePromiseSchema, PromiseEvaluationDTO } from './promise-contracts';

function localDate(value: string, timezone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestError('Requested date must be valid.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayDifference(from: string, to: string): number {
  const fromDay = Date.parse(`${from}T00:00:00.000Z`);
  const toDay = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((toDay - fromDay) / 86_400_000);
}

export class PromiseService {
  private readonly scheduleProposals: ScheduleProposalService;

  constructor(private readonly db: PrismaClient) {
    this.scheduleProposals = new ScheduleProposalService(db);
  }

  /**
   * Evaluates an existing released job with the exact same deterministic dry-run
   * used by Planning. No order date, booking, or promise record is mutated.
   */
  async evaluatePromise(principal: Principal, rawInput: unknown): Promise<PromiseEvaluationDTO> {
    requireAnyPermission(principal, ['planning.read', 'task.assign']);
    const input: EvaluatePromiseInput = EvaluatePromiseSchema.parse(rawInput);
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.requestedDate);
    const requestedCalendarDate = input.requestedDate.slice(0, 10);
    const parsedCalendarDate = new Date(`${requestedCalendarDate}T00:00:00.000Z`);
    if (!Number.isFinite(parsedCalendarDate.getTime()) || parsedCalendarDate.toISOString().slice(0, 10) !== requestedCalendarDate) {
      throw new BadRequestError('Requested date must be a valid calendar date.');
    }

    const schedule = await this.scheduleProposals.propose(principal, {
      orderId: input.orderId,
      instanceId: input.instanceId,
      startHorizon: new Date().toISOString(),
      horizonDays: 30,
    });
    const timezone = schedule.scope.facilityTimezone;
    const requestedDate = isDateOnly
      ? input.requestedDate
      : localDate(input.requestedDate, timezone ?? 'UTC');
    const scheduledDate = schedule.projectedEndAt && timezone
      ? localDate(schedule.projectedEndAt, timezone)
      : null;
    const evaluated = schedule.state === 'COMPLETE' && Boolean(scheduledDate && timezone);
    const missingInputs = evaluated ? [] : [
      ...new Set(schedule.tasks.flatMap((task) => task.status === 'UNSCHEDULED' ? task.reasons : [])),
      ...(schedule.state === 'NO_OPEN_TASKS' ? ['No open tasks remain to establish a delivery completion date from this schedule preview.'] : []),
      ...(!timezone ? ['Facility timezone is unavailable for a delivery-date comparison.'] : []),
    ];
    const deltaDays = evaluated ? dayDifference(requestedDate, scheduledDate!) : null;
    const isFeasibleOnRequestedDate = deltaDays === null ? null : deltaDays <= 0;
    const inputHash = crypto.createHash('sha256').update(JSON.stringify({
      workspaceId: principal.workspaceId,
      orderId: input.orderId,
      instanceId: input.instanceId,
      requestedDate,
      workflowVersionId: schedule.scope.workflowVersionId,
      engineeringRevisionId: schedule.scope.engineeringRevisionId,
      taskVersions: schedule.tasks.map(({ taskId, version }) => ({ taskId, version })),
    })).digest('hex');

    return {
      state: evaluated ? 'EVALUATED' : 'NOT_CONNECTED',
      evaluationId: crypto.randomUUID(),
      inputHash,
      evaluatedAt: schedule.evaluatedAt,
      orderId: input.orderId,
      instanceId: input.instanceId,
      requestedDate,
      feasibleDate: evaluated ? scheduledDate : null,
      projectedEndAt: evaluated ? schedule.projectedEndAt : null,
      isFeasibleOnRequestedDate,
      deltaDays,
      scheduleState: schedule.state as NonNullable<PromiseEvaluationDTO['scheduleState']>,
      bottleneckReason: evaluated
        ? isFeasibleOnRequestedDate
          ? 'The complete finite-capacity proposal finishes by the requested facility-local date.'
          : 'The complete finite-capacity proposal finishes after the requested facility-local date.'
        : 'A complete finite-capacity result could not be established from current job evidence.',
      missingInputs,
      assumptions: [
        ...schedule.assumptions,
        `Requested and projected dates are compared in the facility timezone (${timezone ?? 'unavailable'}).`,
        'This is an estimate for the selected existing job; it does not change the customer commitment or include an unmodeled partial-shipment allocation.',
      ],
      evidence: evaluated ? {
        facilityId: schedule.scope.facilityId,
        facilityTimezone: timezone,
        workflowVersionId: schedule.scope.workflowVersionId,
        engineeringRevisionId: schedule.scope.engineeringRevisionId,
        taskVersions: schedule.tasks.map(({ taskId, version }) => ({ taskId, version })),
      } : null,
    };
  }
}
