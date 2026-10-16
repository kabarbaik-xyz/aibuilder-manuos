import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';

export interface FactoryKpiReportDTO {
  workspaceId: string;
  calculatedAt: string;
  onTimeDelivery: {
    percentage: number;
    deliveredCount: number;
    onTimeCount: number;
    hasData: boolean;
  };
  firstPassYield: {
    percentage: number;
    passedUnits: number;
    reworkUnits: number;
    scrappedUnits: number;
    hasData: boolean;
  };
  planAdherence: {
    percentage: number;
    completedOnTimeCount: number;
    totalCompletedCount: number;
    hasData: boolean;
  };
  meanBlockerResolutionMinutes: {
    meanMinutes: number;
    resolvedBlockersCount: number;
    hasData: boolean;
  };
}

export class FactoryKpiService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Computes authoritative factory KPIs according to the workbook definitions.
   * Handles zero denominators truthfully without faked defaults.
   */
  async computeKpis(principal: Principal): Promise<FactoryKpiReportDTO> {
    requireAnyPermission(principal, ['planning.read', 'execution.read', 'quality.read', 'owner']);

    const workspaceId = principal.workspaceId;

    // 1. KPI-01: On-Time Delivery (OTD)
    const completedOrders = await this.prisma.order.findMany({
      where: {
        workspaceId,
        status: { in: ['COMPLETED', 'DELIVERED', 'SHIPPED'] },
        promisedDate: { not: null },
      },
      select: {
        id: true,
        promisedDate: true,
        updatedAt: true,
      },
    });

    let onTimeCount = 0;
    for (const ord of completedOrders) {
      if (ord.promisedDate && ord.updatedAt <= ord.promisedDate) {
        onTimeCount++;
      }
    }

    const otdHasData = completedOrders.length > 0;
    const otdPercentage = otdHasData
      ? Math.round((onTimeCount / completedOrders.length) * 100)
      : 100;

    // 2. KPI-02: First-Pass Yield (FPY)
    const inspections = await this.prisma.inspection.findMany({
      where: { workspaceId },
      select: {
        passedAtoms: true,
        reworkAtoms: true,
        scrappedAtoms: true,
      },
    });

    let totalPassedAtoms = 0n;
    let totalReworkAtoms = 0n;
    let totalScrappedAtoms = 0n;

    for (const insp of inspections) {
      totalPassedAtoms += insp.passedAtoms;
      totalReworkAtoms += insp.reworkAtoms;
      totalScrappedAtoms += insp.scrappedAtoms;
    }

    const totalInspectedAtoms = totalPassedAtoms + totalReworkAtoms + totalScrappedAtoms;
    const fpyHasData = totalInspectedAtoms > 0n;
    const fpyPercentage = fpyHasData
      ? Number((totalPassedAtoms * 10000n) / totalInspectedAtoms) / 100
      : 100;

    // 3. KPI-04: Plan Adherence (duration within budget)
    const completedTasks = await this.prisma.task.findMany({
      where: {
        workspaceId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: {
        id: true,
        plannedDurationMinutes: true,
        actualDurationMinutes: true,
      },
    });

    let taskOnTimeCount = 0;
    for (const t of completedTasks) {
      if (t.actualDurationMinutes <= t.plannedDurationMinutes) {
        taskOnTimeCount++;
      }
    }

    const adherenceHasData = completedTasks.length > 0;
    const adherencePercentage = adherenceHasData
      ? Math.round((taskOnTimeCount / completedTasks.length) * 100)
      : 100;

    // 4. KPI-05: Blocker Resolution Time
    const resolvedIssues = await this.prisma.taskIssue.findMany({
      where: {
        workspaceId,
        status: 'RESOLVED',
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    let totalResolutionMinutes = 0;
    for (const iss of resolvedIssues) {
      if (iss.resolvedAt) {
        const diffMs = iss.resolvedAt.getTime() - iss.createdAt.getTime();
        totalResolutionMinutes += Math.max(0, Math.round(diffMs / 60000));
      }
    }

    const blockerHasData = resolvedIssues.length > 0;
    const meanBlockerMinutes = blockerHasData
      ? Math.round(totalResolutionMinutes / resolvedIssues.length)
      : 0;

    return {
      workspaceId,
      calculatedAt: new Date().toISOString(),
      onTimeDelivery: {
        percentage: otdPercentage,
        deliveredCount: completedOrders.length,
        onTimeCount,
        hasData: otdHasData,
      },
      firstPassYield: {
        percentage: fpyPercentage,
        passedUnits: Number(totalPassedAtoms / 1000000n),
        reworkUnits: Number(totalReworkAtoms / 1000000n),
        scrappedUnits: Number(totalScrappedAtoms / 1000000n),
        hasData: fpyHasData,
      },
      planAdherence: {
        percentage: adherencePercentage,
        completedOnTimeCount: taskOnTimeCount,
        totalCompletedCount: completedTasks.length,
        hasData: adherenceHasData,
      },
      meanBlockerResolutionMinutes: {
        meanMinutes: meanBlockerMinutes,
        resolvedBlockersCount: resolvedIssues.length,
        hasData: blockerHasData,
      },
    };
  }
}
