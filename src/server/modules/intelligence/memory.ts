import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';

export interface MemoryFilterInput {
  itemId?: string;
  departmentId?: string;
  nodeKey?: string;
}

export interface MemoryRunEvidence {
  taskId: string;
  taskName: string;
  orderNumber: string;
  itemCode: string;
  plannedMinutes: number;
  actualMinutes: number;
  overrunPct: number;
  passedUnits: number;
  reworkUnits: number;
  scrappedUnits: number;
  completedAt: string;
}

export interface FactoryMemoryDTO {
  hasSufficientHistory: boolean;
  sampleCount: number;
  meanOverrunPct: number;
  meanReworkPct: number;
  runs: MemoryRunEvidence[];
  recommendation: {
    title: string;
    description: string;
    suggestedBufferPct: number;
  };
}

export class FactoryMemoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Reads completed task and inspection evidence from the database,
   * computing actual duration overruns and rework percentages without simulated defaults.
   */
  async queryFactoryMemory(
    principal: Principal,
    filter: MemoryFilterInput = {}
  ): Promise<FactoryMemoryDTO> {
    requireAnyPermission(principal, [
      'planning.read',
      'execution.read',
      'owner',
    ]);

    const workspaceId = principal.workspaceId;

    const completedTasks = await this.prisma.task.findMany({
      where: {
        workspaceId,
        status: 'COMPLETED',
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.nodeKey ? { nodeKey: filter.nodeKey } : {}),
        ...(filter.itemId
          ? {
              jobsheet: {
                manufacturingOrder: {
                  order: {
                    itemId: filter.itemId,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        jobsheet: {
          include: {
            manufacturingOrder: {
              include: {
                order: {
                  include: {
                    item: true,
                  },
                },
              },
            },
          },
        },
        workSessions: true,
        productionOutputs: {
          include: {
            inspections: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const runs: MemoryRunEvidence[] = completedTasks.map((t) => {
      // Sum actual recorded work sessions
      const sessionMinutes = t.workSessions.reduce(
        (acc, s) => acc + (s.durationMinutes || 0),
        0
      );
      const actualMinutes = sessionMinutes > 0 ? sessionMinutes : t.actualDurationMinutes || t.plannedDurationMinutes;
      const plannedMinutes = t.plannedDurationMinutes > 0 ? t.plannedDurationMinutes : 60;

      const overrunPct =
        plannedMinutes > 0
          ? Math.round(((actualMinutes - plannedMinutes) / plannedMinutes) * 100)
          : 0;

      let passedAtoms = 0n;
      let reworkAtoms = 0n;
      let scrapAtoms = 0n;

      for (const out of t.productionOutputs) {
        for (const insp of out.inspections) {
          passedAtoms += insp.passedAtoms;
          reworkAtoms += insp.reworkAtoms;
          scrapAtoms += insp.scrappedAtoms;
        }
      }

      return {
        taskId: t.id,
        taskName: t.nodeKey,
        orderNumber: t.jobsheet?.manufacturingOrder?.order?.orderNumber || 'ORD-UNKNOWN',
        itemCode: t.jobsheet?.manufacturingOrder?.order?.item?.code || 'PART-UNKNOWN',
        plannedMinutes,
        actualMinutes,
        overrunPct,
        passedUnits: Number(passedAtoms / 1_000_000n),
        reworkUnits: Number(reworkAtoms / 1_000_000n),
        scrappedUnits: Number(scrapAtoms / 1_000_000n),
        completedAt: t.updatedAt.toISOString(),
      };
    });

    const sampleCount = runs.length;
    const hasSufficientHistory = sampleCount >= 3;

    if (!hasSufficientHistory) {
      return {
        hasSufficientHistory: false,
        sampleCount,
        meanOverrunPct: 0,
        meanReworkPct: 0,
        runs,
        recommendation: {
          title: 'Insufficient historical evidence',
          description: `At least 3 completed production runs are required to project baseline variance. Found ${sampleCount} completed runs.`,
          suggestedBufferPct: 0,
        },
      };
    }

    const sumOverrun = runs.reduce((acc, r) => acc + r.overrunPct, 0);
    const meanOverrunPct = Math.round((sumOverrun / sampleCount) * 10) / 10;

    let totalInspected = 0;
    let totalRework = 0;
    for (const r of runs) {
      const inspected = r.passedUnits + r.reworkUnits + r.scrappedUnits;
      totalInspected += inspected;
      totalRework += r.reworkUnits;
    }

    const meanReworkPct =
      totalInspected > 0
        ? Math.round((totalRework / totalInspected) * 1000) / 10
        : 0;

    const suggestedBufferPct = Math.max(10, Math.round(meanOverrunPct));

    return {
      hasSufficientHistory: true,
      sampleCount,
      meanOverrunPct,
      meanReworkPct,
      runs,
      recommendation: {
        title: `Historical mean overrun: +${meanOverrunPct}%`,
        description: `Based on ${sampleCount} completed production runs, scheduling ${suggestedBufferPct}% buffer padding stabilizes downstream critical path commitments.`,
        suggestedBufferPct,
      },
    };
  }
}
