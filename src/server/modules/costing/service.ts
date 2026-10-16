import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';

export type CostCategory = 'MATERIAL' | 'LABOR' | 'MACHINE' | 'OUTSOURCED' | 'SCRAP';
export type CostType = 'STANDARD' | 'ACTUAL';

export interface RecordCostInput {
  orderId: string;
  taskId?: string;
  costCategory: CostCategory;
  costType: CostType;
  amountCents: bigint | number;
  currency?: string;
  notes?: string;
}

export interface CategoryVarianceDTO {
  category: CostCategory;
  standardCents: string;
  actualCents: string;
  varianceCents: string;
  isFavorable: boolean;
}

export interface OrderCostSummaryDTO {
  orderId: string;
  currency: string;
  totalStandardCents: string;
  totalActualCents: string;
  totalVarianceCents: string;
  isFavorable: boolean;
  categories: CategoryVarianceDTO[];
}

export class JobCostingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Records a standard cost budget or an actual incurred cost entry in integer minor units (cents).
   * Strict Rule: Never uses floating-point numbers for financial ledger calculations.
   */
  async recordCostEntry(principal: Principal, input: RecordCostInput) {
    requireAnyPermission(principal, ['cost.manage', 'owner', 'access.manage', 'order.release']);

    const workspaceId = principal.workspaceId;
    const amountBigInt = typeof input.amountCents === 'number' ? BigInt(input.amountCents) : input.amountCents;

    if (amountBigInt < 0n) {
      throw new BadRequestError('Cost amount in minor units cannot be negative.');
    }

    const order = await this.prisma.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found.`);
    }

    const entry = await this.prisma.jobCostEntry.create({
      data: {
        workspaceId,
        orderId: input.orderId,
        taskId: input.taskId,
        costCategory: input.costCategory,
        costType: input.costType,
        amountCents: amountBigInt,
        currency: input.currency || 'IDR',
        notes: input.notes,
      },
    });

    return {
      id: entry.id,
      orderId: entry.orderId,
      costCategory: entry.costCategory,
      costType: entry.costType,
      amountCents: entry.amountCents.toString(),
      currency: entry.currency,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  /**
   * Aggregates standard budget vs actual incurred cost ledger entries for an order.
   * Compares variances by cost category (MATERIAL, LABOR, MACHINE, etc.) with integer arithmetic.
   */
  async getOrderCostSummary(principal: Principal, orderId: string): Promise<OrderCostSummaryDTO> {
    requireAnyPermission(principal, ['cost.read', 'owner', 'access.manage', 'order.release']);

    const workspaceId = principal.workspaceId;

    const entries = await this.prisma.jobCostEntry.findMany({
      where: {
        workspaceId,
        orderId,
      },
    });

    const categoryMap = new Map<CostCategory, { standard: bigint; actual: bigint }>();
    const allCategories: CostCategory[] = ['MATERIAL', 'LABOR', 'MACHINE', 'OUTSOURCED', 'SCRAP'];

    for (const cat of allCategories) {
      categoryMap.set(cat, { standard: 0n, actual: 0n });
    }

    let defaultCurrency = 'IDR';
    let totalStandard = 0n;
    let totalActual = 0n;

    for (const e of entries) {
      defaultCurrency = e.currency;
      const cat = e.costCategory as CostCategory;
      const slot = categoryMap.get(cat) || { standard: 0n, actual: 0n };

      if (e.costType === 'STANDARD') {
        slot.standard += e.amountCents;
        totalStandard += e.amountCents;
      } else if (e.costType === 'ACTUAL') {
        slot.actual += e.amountCents;
        totalActual += e.amountCents;
      }
      categoryMap.set(cat, slot);
    }

    const categories: CategoryVarianceDTO[] = [];
    for (const [cat, val] of categoryMap.entries()) {
      const variance = val.actual - val.standard;
      categories.push({
        category: cat,
        standardCents: val.standard.toString(),
        actualCents: val.actual.toString(),
        varianceCents: variance.toString(),
        isFavorable: variance <= 0n, // Actual <= Standard is favorable
      });
    }

    const totalVariance = totalActual - totalStandard;

    return {
      orderId,
      currency: defaultCurrency,
      totalStandardCents: totalStandard.toString(),
      totalActualCents: totalActual.toString(),
      totalVarianceCents: totalVariance.toString(),
      isFavorable: totalVariance <= 0n,
      categories,
    };
  }
}
