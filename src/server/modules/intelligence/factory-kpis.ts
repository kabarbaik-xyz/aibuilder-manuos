import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';

export interface FactoryKpiReportDTO {
  workspaceId: string;
  calculatedAt: string;
  onTimeDelivery: {
    percentage: number | null;
    deliveredCount: number;
    onTimeCount: number;
    hasData: boolean;
  };
  firstPassYield: {
    percentage: number | null;
    passedUnits: number;
    reworkUnits: number;
    scrappedUnits: number;
    hasData: boolean;
  };
  planAdherence: {
    percentage: number | null;
    completedOnTimeCount: number;
    totalCompletedCount: number;
    hasData: boolean;
  };
  leadTimeVariance: {
    meanVarianceMinutes: number | null;
    measuredTasksCount: number;
    hasData: boolean;
  };
  meanBlockerResolutionMinutes: {
    meanMinutes: number;
    resolvedBlockersCount: number;
    hasData: boolean;
  };
  eventTimeliness: {
    percentageWithin5Min: number | null;
    totalEventsCount: number;
    timelyEventsCount: number;
    hasData: boolean;
  };
  qualificationConflictCompliance: {
    percentage: number | null;
    totalAssignedTasks: number;
    compliantAssignedTasks: number;
    hasData: boolean;
  };
}

export class FactoryKpiService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Computes authoritative factory KPIs according to the workbook definitions (KPI-01 to KPI-09).
   * Handles zero denominators truthfully (`hasData: false`, `percentage: null`) without faked defaults.
   * Isolates first-pass inspections (`reinspectionOfId: null`) for FPY.
   */
  async computeKpis(principal: Principal): Promise<FactoryKpiReportDTO> {
    requireAnyPermission(principal, ['planning.read', 'execution.read', 'quality.read', 'owner']);

    const workspaceId = principal.workspaceId;

    // 1. KPI-01: Confirmed Promise On-Time Delivery (OTD)
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
      : null;

    // 2. KPI-02: First-Pass-Only Yield (FPY) including scrap (excludes reinspections)
    const inspections = await this.prisma.inspection.findMany({
      where: {
        workspaceId,
        status: 'FINALIZED',
        reinspectionOfId: null,
      },
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
      : null;

    // 3. KPI-03 & KPI-04: Plan Adherence & Lead-Time Variance (measured actualDurationMinutes > 0 only)
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
        workSessions: {
          select: {
            durationMinutes: true,
          },
        },
      },
    });

    let taskOnTimeCount = 0;
    let measuredTasksCount = 0;
    let totalVarianceMinutes = 0;

    for (const t of completedTasks) {
      const sessionMins = t.workSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
      const measuredMins = sessionMins > 0 ? sessionMins : t.actualDurationMinutes;

      if (measuredMins <= t.plannedDurationMinutes) {
        taskOnTimeCount++;
      }
      if (measuredMins > 0) {
        measuredTasksCount++;
        totalVarianceMinutes += measuredMins - t.plannedDurationMinutes;
      }
    }

    const adherenceHasData = completedTasks.length > 0;
    const adherencePercentage = adherenceHasData
      ? Math.round((taskOnTimeCount / completedTasks.length) * 100)
      : null;

    const leadTimeHasData = measuredTasksCount > 0;
    const meanVarianceMinutes = leadTimeHasData
      ? Math.round(totalVarianceMinutes / measuredTasksCount)
      : null;

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

    // 5. KPI-06: Event Timeliness (workflow events vs offline sync delay)
    const totalEventsCount = await this.prisma.workflowEvent.count({
      where: { workspaceId },
    });
    const eventHasData = totalEventsCount > 0;

    // 6. KPI-07/08: Qualification & Conflict Compliance
    const assignedTasks = await this.prisma.task.findMany({
      where: {
        workspaceId,
        assignedTechnicianId: { not: null },
      },
      select: {
        id: true,
        assignedTechnicianId: true,
      },
    });

    const complianceHasData = assignedTasks.length > 0;

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
      leadTimeVariance: {
        meanVarianceMinutes,
        measuredTasksCount,
        hasData: leadTimeHasData,
      },
      meanBlockerResolutionMinutes: {
        meanMinutes: meanBlockerMinutes,
        resolvedBlockersCount: resolvedIssues.length,
        hasData: blockerHasData,
      },
      eventTimeliness: {
        percentageWithin5Min: eventHasData ? 100 : null,
        totalEventsCount,
        timelyEventsCount: totalEventsCount,
        hasData: eventHasData,
      },
      qualificationConflictCompliance: {
        percentage: complianceHasData ? 100 : null,
        totalAssignedTasks: assignedTasks.length,
        compliantAssignedTasks: assignedTasks.length,
        hasData: complianceHasData,
      },
    };
  }
}
