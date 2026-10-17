import { PrismaClient } from '@prisma/client';
import { db } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { randomUUID } from 'crypto';

export type CostCategory = 'MATERIAL' | 'LABOR' | 'MACHINE' | 'OUTSOURCED' | 'SCRAP';
export type CostType = 'STANDARD' | 'ACTUAL';

export interface RecordCostInput {
  orderId: string;
  taskId?: string;
  costCategory: CostCategory;
  costType: CostType;
  amountCents: bigint | string;
  currency?: string;
  notes?: string;
}

export interface CategoryVarianceDTO {
  category: CostCategory;
  standardCents: string | null;
  actualCents: string | null;
  varianceCents: string | null;
  hasStandard: boolean;
  hasActual: boolean;
  isFavorable: boolean | null;
  entries: Array<{ id: string; taskId: string | null; costType: CostType; amountCents: string; notes: string | null; createdAt: string }>;
}

export interface OrderCostSummaryDTO {
  orderId: string;
  currency: string | null;
  hasEntries: boolean;
  hasStandard: boolean;
  hasActual: boolean;
  totalStandardCents: string | null;
  totalActualCents: string | null;
  totalVarianceCents: string | null;
  isFavorable: boolean | null;
  categories: CategoryVarianceDTO[];
}

export interface CostVarianceExplanationDTO {
  orderId: string;
  currency: string | null;
  totalVarianceCents: string | null;
  coverage: { standard: boolean; actual: boolean };
  unavailableReason: string | null;
  contributors: Array<{
    category: CostCategory;
    varianceCents: string;
    sourceEntryCount: number;
    sourceEntryIds: string[];
    evidenceHref: string;
  }>;
}

export class JobCostingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Records a standard cost budget or an actual incurred cost entry in integer minor units (cents).
   * Strict Rule: Never uses floating-point numbers for financial ledger calculations.
   */
  async recordCostEntry(principal: Principal, input: RecordCostInput, idempotencyKey: string = randomUUID()) {
    requireAnyPermission(principal, ['cost.manage']);

    const workspaceId = principal.workspaceId;
    if (typeof input.amountCents === 'string' && !/^\d+$/.test(input.amountCents)) {
      throw new BadRequestError('Cost amount must be a non-negative integer minor-unit string.');
    }
    const amountBigInt = typeof input.amountCents === 'bigint' ? input.amountCents : BigInt(input.amountCents);

    if (amountBigInt < 0n) {
      throw new BadRequestError('Cost amount in minor units cannot be negative.');
    }

    const commandInput = { ...input, amountCents: amountBigInt };
    return executeCommand({
      principal,
      commandType: 'costing.record_entry',
      idempotencyKey,
      payload: commandInput,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.orderId } },
        });
        if (!order) throw new NotFoundError(`Order '${input.orderId}' not found.`);

        if (input.taskId) {
          const task = await tx.task.findFirst({
            where: { id: input.taskId, workspaceId, jobsheet: { manufacturingOrder: { orderId: input.orderId } } },
            select: { id: true },
          });
          if (!task) throw new BadRequestError('Cost task must belong to the specified workspace order.');
        }

        const existingCurrencies = await tx.jobCostEntry.findMany({
          where: { workspaceId, orderId: input.orderId }, select: { currency: true }, distinct: ['currency'],
        });
        const currency = (input.currency ?? existingCurrencies[0]?.currency ?? 'IDR').toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestError('Currency must be a three-letter ISO code.');
        if (existingCurrencies.some((entry: { currency: string }) => entry.currency !== currency)) {
          throw new BadRequestError('Cost entries for one order must use a single currency; reconcile existing entries before adding another currency.');
        }

        const entry = await tx.jobCostEntry.create({
          data: { workspaceId, orderId: input.orderId, taskId: input.taskId, costCategory: input.costCategory,
            costType: input.costType, amountCents: amountBigInt, currency, notes: input.notes },
        });
        return {
          data: { id: entry.id, orderId: entry.orderId, costCategory: entry.costCategory,
            costType: entry.costType, amountCents: entry.amountCents.toString(), currency: entry.currency,
            createdAt: entry.createdAt.toISOString() },
          aggregateType: 'JobCostEntry',
          aggregateId: entry.id,
          resourceVersion: 1,
          auditDetails: { orderId: input.orderId, taskId: input.taskId ?? null, costType: input.costType,
            costCategory: input.costCategory, amountCents: amountBigInt.toString(), currency },
        };
      },
    });
  }

  /**
   * Aggregates standard budget vs actual incurred cost ledger entries for an order.
   * Compares variances by cost category (MATERIAL, LABOR, MACHINE, etc.) with integer arithmetic.
   */
  async getOrderCostSummary(principal: Principal, orderId: string): Promise<OrderCostSummaryDTO> {
    requireAnyPermission(principal, ['cost.read']);

    const workspaceId = principal.workspaceId;

    const order = await this.prisma.order.findUnique({
      where: { workspaceId_id: { workspaceId, id: orderId } },
      select: { id: true },
    });
    if (!order) throw new NotFoundError(`Order '${orderId}' not found.`);

    const entries = await this.prisma.jobCostEntry.findMany({
      where: {
        workspaceId,
        orderId,
      },
    });

    const currencies = [...new Set(entries.map(entry => entry.currency))];
    if (currencies.length > 1) {
      throw new BadRequestError(`Order cost ledger contains mixed currencies (${currencies.join(', ')}); separate or reconcile those entries before comparing totals.`);
    }

    const categoryMap = new Map<CostCategory, { standard: bigint; actual: bigint; hasStandard: boolean; hasActual: boolean; entries: CategoryVarianceDTO['entries'] }>();
    const allCategories: CostCategory[] = ['MATERIAL', 'LABOR', 'MACHINE', 'OUTSOURCED', 'SCRAP'];

    for (const cat of allCategories) {
      categoryMap.set(cat, { standard: 0n, actual: 0n, hasStandard: false, hasActual: false, entries: [] });
    }

    let totalStandard = 0n;
    let totalActual = 0n;
    let hasStandard = false;
    let hasActual = false;

    for (const e of entries) {
      const cat = e.costCategory as CostCategory;
      const slot = categoryMap.get(cat) || { standard: 0n, actual: 0n, hasStandard: false, hasActual: false, entries: [] };

      if (e.costType === 'STANDARD') {
        slot.standard += e.amountCents;
        totalStandard += e.amountCents;
        slot.hasStandard = true;
        hasStandard = true;
      } else if (e.costType === 'ACTUAL') {
        slot.actual += e.amountCents;
        totalActual += e.amountCents;
        slot.hasActual = true;
        hasActual = true;
      }
      slot.entries.push({ id: e.id, taskId: e.taskId, costType: e.costType as CostType, amountCents: e.amountCents.toString(), notes: e.notes, createdAt: e.createdAt.toISOString() });
      categoryMap.set(cat, slot);
    }

    const categories: CategoryVarianceDTO[] = [];
    for (const [cat, val] of categoryMap.entries()) {
      const variance = val.actual - val.standard;
      categories.push({
        category: cat,
        standardCents: val.hasStandard ? val.standard.toString() : null,
        actualCents: val.hasActual ? val.actual.toString() : null,
        varianceCents: val.hasStandard && val.hasActual ? variance.toString() : null,
        hasStandard: val.hasStandard,
        hasActual: val.hasActual,
        isFavorable: val.hasStandard && val.hasActual ? variance <= 0n : null,
        entries: val.entries,
      });
    }

    const totalVariance = hasStandard && hasActual ? totalActual - totalStandard : null;

    return {
      orderId,
      currency: currencies[0] ?? null,
      hasEntries: entries.length > 0,
      hasStandard,
      hasActual,
      totalStandardCents: hasStandard ? totalStandard.toString() : null,
      totalActualCents: hasActual ? totalActual.toString() : null,
      totalVarianceCents: totalVariance?.toString() ?? null,
      isFavorable: totalVariance !== null ? totalVariance <= 0n : null,
      categories,
    };
  }

  async getOrderCostExplanation(principal: Principal, orderId: string): Promise<CostVarianceExplanationDTO> {
    const summary = await this.getOrderCostSummary(principal, orderId);
    const contributors = summary.categories
      .filter(category => category.varianceCents !== null)
      .map(category => ({
        category: category.category,
        varianceCents: category.varianceCents!,
        sourceEntryCount: category.entries.length,
        sourceEntryIds: category.entries.map(entry => entry.id),
        evidenceHref: `/orders/${encodeURIComponent(orderId)}`,
      }))
      .sort((left, right) => {
        const leftValue = BigInt(left.varianceCents);
        const rightValue = BigInt(right.varianceCents);
        const leftMagnitude = leftValue < 0n ? -leftValue : leftValue;
        const rightMagnitude = rightValue < 0n ? -rightValue : rightValue;
        return leftMagnitude > rightMagnitude ? -1 : leftMagnitude < rightMagnitude ? 1 : left.category.localeCompare(right.category);
      });
    const hasCompleteCoverage = summary.hasStandard && summary.hasActual;

    return {
      orderId,
      currency: summary.currency,
      totalVarianceCents: summary.totalVarianceCents,
      coverage: { standard: summary.hasStandard, actual: summary.hasActual },
      unavailableReason: hasCompleteCoverage ? null : 'A variance comparison requires both standard and actual cost entries.',
      contributors,
    };
  }
}

export const jobCostingService = new JobCostingService(db);
