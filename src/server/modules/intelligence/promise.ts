import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BadRequestError } from '@/domain/errors';
import { parseQuantity } from '@/domain/quantity';
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

    const scopedInstance = await this.db.workflowInstance.findFirst({
      where: { workspaceId: principal.workspaceId, orderId: input.orderId, id: input.instanceId, status: 'ACTIVE' },
      select: {
        engineeringRevisionId: true,
        order: { select: { facility: { select: { timezone: true } } } },
        engineeringRevision: {
          select: {
            orderLine: { select: { orderedAtoms: true, shippedAtoms: true, uom: { select: { code: true, precision: true } }, item: { select: { baseUom: { select: { code: true, precision: true } } } } } },
          },
        },
      },
    });
    if (!scopedInstance) throw new BadRequestError('Select an active job belonging to this order.');
    const manufacturingOrders = await this.db.manufacturingOrder.findMany({
      where: { workspaceId: principal.workspaceId, orderId: input.orderId, engineeringRevisionId: scopedInstance.engineeringRevisionId, status: { in: ['RELEASED', 'IN_PROGRESS'] } },
      select: { targetAtoms: true },
      take: 2,
    });
    const linkedLine = scopedInstance.engineeringRevision.orderLine;
    const uom = linkedLine?.uom ?? linkedLine?.item.baseUom ?? null;
    const scopedTimezone = scopedInstance.order.facility?.timezone ?? 'UTC';
    const normalizedRequestedDate = isDateOnly ? input.requestedDate : localDate(input.requestedDate, scopedTimezone);
    let requestedAtoms: bigint;
    try {
      requestedAtoms = parseQuantity(input.requestedQuantity, uom?.precision ?? 6);
    } catch (error) {
      throw new BadRequestError(error instanceof Error ? error.message : 'Requested quantity is invalid.');
    }
    if (requestedAtoms <= 0n) throw new BadRequestError('Requested quantity must be greater than zero.');
    const quantitySupported = Boolean(
      linkedLine && manufacturingOrders.length === 1 &&
      requestedAtoms === manufacturingOrders[0].targetAtoms &&
      manufacturingOrders[0].targetAtoms <= linkedLine.orderedAtoms - linkedLine.shippedAtoms
    );
    const inputHash = crypto.createHash('sha256').update(JSON.stringify({
      workspaceId: principal.workspaceId, orderId: input.orderId, instanceId: input.instanceId,
      requestedDate: normalizedRequestedDate, requestedQuantityAtoms: requestedAtoms.toString(),
      engineeringRevisionId: scopedInstance.engineeringRevisionId,
    })).digest('hex');
    if (!quantitySupported) {
      return {
        state: 'NOT_CONNECTED',
        evaluationId: crypto.randomUUID(),
        inputHash,
        evaluatedAt: new Date().toISOString(),
        orderId: input.orderId,
        instanceId: input.instanceId,
        requestedQuantity: input.requestedQuantity,
        requestedQuantityAtoms: requestedAtoms.toString(),
        quantityUom: uom?.code ?? null,
        requestedDate: normalizedRequestedDate,
        feasibleDate: null,
        projectedEndAt: null,
        isFeasibleOnRequestedDate: null,
        deltaDays: null,
        scheduleState: null,
        bottleneckReason: 'A quantity-matched schedule cannot be established from the selected job evidence.',
        missingInputs: [
          ...(!linkedLine ? ['The selected engineering revision is not linked to one order line.'] : []),
          ...(manufacturingOrders.length !== 1 ? ['The selected job does not resolve to exactly one manufacturing order.'] : []),
          ...(manufacturingOrders.length === 1 && requestedAtoms !== manufacturingOrders[0].targetAtoms ? ['Partial or different-quantity scheduling is not supported; evaluate the full selected manufacturing-order quantity.'] : []),
          ...(linkedLine && manufacturingOrders.length === 1 && manufacturingOrders[0].targetAtoms > linkedLine.orderedAtoms - linkedLine.shippedAtoms ? ['The selected job quantity exceeds the unshipped order-line quantity.'] : []),
        ],
        assumptions: ['No schedule is evaluated when its quantity cannot be matched to the selected released job.'],
        componentReadiness: [],
        evidence: null,
      };
    }

    const schedule = await this.scheduleProposals.propose(principal, {
      orderId: input.orderId,
      instanceId: input.instanceId,
      // Leave a short review window so Promise and Planning use the same
      // actionable horizon instead of proposing work that starts immediately.
      startHorizon: new Date(Date.now() + 5 * 60_000).toISOString(),
      horizonDays: 30,
    });
    const taskIds = schedule.tasks.map(({ taskId }) => taskId);
    const demands = taskIds.length ? await this.db.materialDemand.findMany({
      where: { workspaceId: principal.workspaceId, orderId: input.orderId, taskId: { in: taskIds }, status: { not: 'CLOSED' } },
      include: { item: { include: { baseUom: true } }, reservations: true },
      orderBy: [{ itemId: 'asc' }, { createdAt: 'asc' }],
    }) : [];
    const itemIds = [...new Set(demands.map(({ itemId }) => itemId))];
    const [supplyLines, rawBalances] = itemIds.length ? await Promise.all([
      this.db.supplyOrderLine.findMany({
        where: { workspaceId: principal.workspaceId, itemId: { in: itemIds }, supplyOrder: { status: { in: ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'] } } },
        include: {
          supplyOrder: { select: { id: true, orderNumber: true, expectedDate: true, supplier: { select: { name: true } } } },
          materialAllocations: {
            where: { demandId: { in: demands.map(({ id }) => id) } },
            include: { receiptAllocations: { include: { stockReservation: { select: { status: true, reservedAtoms: true } } } } },
          },
        },
        orderBy: { supplyOrder: { expectedDate: 'asc' } },
        take: 100,
      }),
      this.db.stockBalance.findMany({
        where: { workspaceId: principal.workspaceId, itemId: { in: itemIds }, location: { is: { kind: 'RAW', isActive: true } } },
        select: { itemId: true, onHandAtoms: true, reservedAtoms: true },
      }),
    ]) : [[], []];
    const supplyByItem = new Map<string, Array<{ supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; remainingAtoms: string }>>();
    const allocatedSupplyByDemand = new Map<string, Array<{ supplyOrderLineId: string; supplyOrderId: string; supplyOrderNumber: string; supplierName: string; expectedDate: string; allocatedOutstandingAtoms: string; receivedAtoms: string; activelyReservedAtoms: string }>>();
    for (const line of supplyLines) {
      const remainingAtoms = line.orderedAtoms - line.receivedAtoms;
      const outstandingAllocatedAtoms = line.materialAllocations.reduce((sum, allocation) => sum + allocation.allocatedAtoms - allocation.receivedAtoms, 0n);
      const unallocatedAtoms = remainingAtoms > outstandingAllocatedAtoms ? remainingAtoms - outstandingAllocatedAtoms : 0n;
      if (unallocatedAtoms > 0n) {
        const rows = supplyByItem.get(line.itemId) ?? [];
        rows.push({ supplyOrderId: line.supplyOrder.id, supplyOrderNumber: line.supplyOrder.orderNumber, supplierName: line.supplyOrder.supplier.name, expectedDate: line.supplyOrder.expectedDate.toISOString(), remainingAtoms: unallocatedAtoms.toString() });
        supplyByItem.set(line.itemId, rows);
      }
      for (const allocation of line.materialAllocations) {
        const rows = allocatedSupplyByDemand.get(allocation.demandId) ?? [];
        const activelyReservedAtoms = allocation.receiptAllocations.reduce((sum, receipt) =>
          sum + (receipt.stockReservation?.status === 'ACTIVE' ? receipt.stockReservation.reservedAtoms : 0n), 0n);
        rows.push({
          supplyOrderLineId: line.id,
          supplyOrderId: line.supplyOrder.id,
          supplyOrderNumber: line.supplyOrder.orderNumber,
          supplierName: line.supplyOrder.supplier.name,
          expectedDate: line.supplyOrder.expectedDate.toISOString(),
          allocatedOutstandingAtoms: (allocation.allocatedAtoms - allocation.receivedAtoms).toString(),
          receivedAtoms: allocation.receivedAtoms.toString(),
          activelyReservedAtoms: activelyReservedAtoms.toString(),
        });
        allocatedSupplyByDemand.set(allocation.demandId, rows);
      }
    }
    const rawAvailableByItem = new Map<string, bigint>();
    for (const balance of rawBalances) {
      const available = balance.onHandAtoms - balance.reservedAtoms;
      rawAvailableByItem.set(balance.itemId, (rawAvailableByItem.get(balance.itemId) ?? 0n) + (available > 0n ? available : 0n));
    }
    const componentTotals = new Map<string, { item: (typeof demands)[number]['item']; requiredAtoms: bigint; issuedAtoms: bigint; reservedAtoms: bigint }>();
    for (const demand of demands) {
      const total = componentTotals.get(demand.itemId) ?? { item: demand.item, requiredAtoms: 0n, issuedAtoms: 0n, reservedAtoms: 0n };
      total.requiredAtoms += demand.requiredAtoms;
      if (demand.status === 'ISSUED') total.issuedAtoms += demand.requiredAtoms;
      else total.reservedAtoms += demand.reservations.filter(({ status }) => status === 'ACTIVE').reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
      componentTotals.set(demand.itemId, total);
    }
    const componentReadiness = [...componentTotals.entries()].map(([itemId, total]) => {
      const outstandingAtoms = total.requiredAtoms - total.issuedAtoms;
      return {
        itemId,
        itemCode: total.item.code,
        itemName: total.item.name,
        quantityUom: total.item.baseUom.code,
        requiredAtoms: total.requiredAtoms.toString(),
        issuedAtoms: total.issuedAtoms.toString(),
        reservedAtoms: total.reservedAtoms.toString(),
        availableRawAtoms: (rawAvailableByItem.get(itemId) ?? 0n).toString(),
        state: (outstandingAtoms === 0n ? 'ISSUED' : total.reservedAtoms >= outstandingAtoms ? 'RESERVED' : 'UNALLOCATED') as 'ISSUED' | 'RESERVED' | 'UNALLOCATED',
        allocatedSupply: demands.filter(({ itemId: demandItemId }) => demandItemId === itemId).flatMap(({ id }) => allocatedSupplyByDemand.get(id) ?? []),
        confirmedSupply: supplyByItem.get(itemId) ?? [],
      };
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
    const scheduleInputHash = crypto.createHash('sha256').update(JSON.stringify({
      workspaceId: principal.workspaceId,
      orderId: input.orderId,
      instanceId: input.instanceId,
      requestedDate,
      requestedQuantityAtoms: requestedAtoms.toString(),
      workflowVersionId: schedule.scope.workflowVersionId,
      engineeringRevisionId: schedule.scope.engineeringRevisionId,
      taskVersions: schedule.tasks.map(({ taskId, version }) => ({ taskId, version })),
    })).digest('hex');

    return {
      state: evaluated ? 'EVALUATED' : 'NOT_CONNECTED',
      evaluationId: crypto.randomUUID(),
      inputHash: scheduleInputHash,
      evaluatedAt: schedule.evaluatedAt,
      orderId: input.orderId,
      instanceId: input.instanceId,
      requestedQuantity: input.requestedQuantity,
      requestedQuantityAtoms: requestedAtoms.toString(),
      quantityUom: uom?.code ?? null,
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
      componentReadiness,
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
