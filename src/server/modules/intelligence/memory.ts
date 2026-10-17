import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError } from '@/domain/errors';

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date must be a valid calendar day');

const MemoryFilterSchema = z.object({
  itemId: z.string().min(1).max(100).optional(),
  departmentId: z.string().min(1).max(100).optional(),
  nodeKey: z.string().trim().min(1).max(100).optional(),
  workflowVersionId: z.string().trim().min(1).max(100).optional(),
  facilityId: z.string().trim().min(1).max(100).optional(),
  completedFrom: DateOnlySchema.optional(),
  completedTo: DateOnlySchema.optional(),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().refine(value => [10, 25, 50].includes(value)).default(10),
});

export type MemoryFilterInput = z.input<typeof MemoryFilterSchema>;

export interface MemoryRunEvidence {
  taskId: string;
  orderId: string | null;
  taskName: string;
  orderNumber: string;
  itemId: string | null;
  itemCode: string;
  plannedMinutes: number | null;
  actualMinutes: number | null;
  overrunPct: number | null;
  passedAtoms: string;
  reworkAtoms: string;
  scrappedAtoms: string;
  completedAt: string;
  workflowVersionId: string | null;
  facilityId: string | null;
}

export interface FactoryMemoryDTO {
  hasSufficientHistory: boolean;
  sampleCount: number;
  completedRunCount: number;
  measuredSampleCount: number;
  excludedRunCount: number;
  excludedReasons: Record<string, number>;
  meanOverrunPct: number | null;
  meanReworkPct: number | null;
  runs: MemoryRunEvidence[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  cohort: { itemId: string | null; departmentId: string | null; nodeKey: string | null; workflowVersionId: string | null; facilityId: string | null; completedFrom: string | null; completedTo: string | null; comparable: boolean };
  recommendation: {
    title: string;
    description: string;
    suggestedBufferPct: null;
  };
}

export class FactoryMemoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async queryFactoryMemory(principal: Principal, rawFilter: MemoryFilterInput = {}): Promise<FactoryMemoryDTO> {
    requireAnyPermission(principal, ['planning.read', 'execution.read', 'owner']);
    const filter = MemoryFilterSchema.parse(rawFilter);
    if (filter.completedFrom && filter.completedTo && filter.completedFrom > filter.completedTo) {
      throw new BadRequestError('Completion start date must be on or before the end date');
    }

    const completedAfter = filter.completedFrom ? new Date(`${filter.completedFrom}T00:00:00.000Z`) : undefined;
    const completedBefore = filter.completedTo ? new Date(`${filter.completedTo}T00:00:00.000Z`) : undefined;
    if (completedBefore) completedBefore.setUTCDate(completedBefore.getUTCDate() + 1);

    const completedTasks = await this.prisma.task.findMany({
      where: {
        workspaceId: principal.workspaceId,
        status: 'COMPLETED',
        ...(filter.departmentId || filter.itemId ? {
          jobsheet: { is: { manufacturingOrder: { is: {
            ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
            ...(filter.itemId ? { order: { is: { itemId: filter.itemId } } } : {}),
          } } } },
        } : {}),
        ...(filter.nodeKey ? { nodeKey: filter.nodeKey } : {}),
        ...(filter.workflowVersionId || filter.facilityId ? {
          instance: { is: {
            ...(filter.workflowVersionId ? { workflowVersionId: filter.workflowVersionId } : {}),
            ...(filter.facilityId ? { order: { is: { facilityId: filter.facilityId } } } : {}),
          } },
        } : {}),
        ...(completedAfter || completedBefore ? { updatedAt: { ...(completedAfter ? { gte: completedAfter } : {}), ...(completedBefore ? { lt: completedBefore } : {}) } } : {}),
      },
      include: {
        jobsheet: { include: { manufacturingOrder: { include: { order: { include: { item: true } } } } } },
        instance: { include: { order: true } },
        workSessions: true,
        productionOutputs: { include: { inspections: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    const excludedReasons: Record<string, number> = {};
    const allRuns: MemoryRunEvidence[] = completedTasks.map(task => {
      const sessionMinutes = task.workSessions.reduce((sum, session) => sum + Math.max(0, session.durationMinutes ?? 0), 0);
      const measuredMinutes = sessionMinutes > 0
        ? sessionMinutes
        : task.actualDurationMinutes > 0 ? task.actualDurationMinutes : null;
      const plannedMinutes = task.plannedDurationMinutes > 0 ? task.plannedDurationMinutes : null;
      if (measuredMinutes === null) excludedReasons.MISSING_MEASURED_DURATION = (excludedReasons.MISSING_MEASURED_DURATION ?? 0) + 1;
      if (plannedMinutes === null) excludedReasons.MISSING_PLANNED_DURATION = (excludedReasons.MISSING_PLANNED_DURATION ?? 0) + 1;

      let passedAtoms = 0n;
      let reworkAtoms = 0n;
      let scrappedAtoms = 0n;
      for (const output of task.productionOutputs) {
        for (const inspection of output.inspections) {
          if (inspection.status !== 'FINALIZED' || inspection.reinspectionOfId) continue;
          passedAtoms += inspection.passedAtoms;
          reworkAtoms += inspection.reworkAtoms;
          scrappedAtoms += inspection.scrappedAtoms;
        }
      }

      return {
        taskId: task.id,
        orderId: task.jobsheet?.manufacturingOrder?.order?.id ?? null,
        taskName: task.nodeKey,
        orderNumber: task.jobsheet?.manufacturingOrder?.order?.orderNumber ?? 'Unavailable',
        itemId: task.jobsheet?.manufacturingOrder?.order?.item?.id ?? null,
        itemCode: task.jobsheet?.manufacturingOrder?.order?.item?.code ?? 'Unavailable',
        plannedMinutes,
        actualMinutes: measuredMinutes,
        overrunPct: measuredMinutes !== null && plannedMinutes !== null
          ? Math.round(((measuredMinutes - plannedMinutes) / plannedMinutes) * 1000) / 10
          : null,
        passedAtoms: passedAtoms.toString(),
        reworkAtoms: reworkAtoms.toString(),
        scrappedAtoms: scrappedAtoms.toString(),
        completedAt: task.updatedAt.toISOString(),
        workflowVersionId: task.instance.workflowVersionId,
        facilityId: task.instance.order.facilityId,
      };
    });

    const measuredRuns = allRuns.filter(run => run.overrunPct !== null);
    const measuredSampleCount = measuredRuns.length;
    const comparableCohort = Boolean(filter.itemId && filter.nodeKey);
    const meanOverrunPct = comparableCohort && measuredSampleCount
      ? Math.round((measuredRuns.reduce((sum, run) => sum + (run.overrunPct ?? 0), 0) / measuredSampleCount) * 10) / 10
      : null;
    const inspectedAtoms = allRuns.reduce((sum, run) => sum + BigInt(run.passedAtoms) + BigInt(run.reworkAtoms) + BigInt(run.scrappedAtoms), 0n);
    const reworkAtoms = allRuns.reduce((sum, run) => sum + BigInt(run.reworkAtoms), 0n);
    const meanReworkPct = comparableCohort && inspectedAtoms > 0n
      ? Number((reworkAtoms * 1_000_000n) / inspectedAtoms) / 10_000
      : null;
    const totalPages = Math.max(1, Math.ceil(allRuns.length / filter.pageSize));
    const page = Math.min(filter.page, totalPages);
    const start = (page - 1) * filter.pageSize;

    return {
      hasSufficientHistory: comparableCohort && measuredSampleCount >= 3,
      sampleCount: measuredSampleCount,
      completedRunCount: allRuns.length,
      measuredSampleCount,
      excludedRunCount: allRuns.length - measuredSampleCount,
      excludedReasons,
      meanOverrunPct,
      meanReworkPct,
      runs: allRuns.slice(start, start + filter.pageSize),
      pagination: { page, pageSize: filter.pageSize, total: allRuns.length, totalPages },
      cohort: {
        itemId: filter.itemId ?? null,
        departmentId: filter.departmentId ?? null,
        nodeKey: filter.nodeKey ?? null,
        workflowVersionId: filter.workflowVersionId ?? null,
        facilityId: filter.facilityId ?? null,
        completedFrom: filter.completedFrom ?? null,
        completedTo: filter.completedTo ?? null,
        comparable: comparableCohort,
      },
      recommendation: !comparableCohort
        ? {
            title: 'Select a comparable item and process cohort',
            description: 'Workspace-wide averages are not shown because unrelated products and operations should not be mixed into one benchmark.',
            suggestedBufferPct: null,
          }
        : measuredSampleCount >= 3
        ? {
            title: `Measured mean overrun: ${meanOverrunPct}%`,
            description: 'Historical measurements are evidence only. No planning buffer is recommended until an approved cohort rule is configured.',
            suggestedBufferPct: null,
          }
        : {
            title: 'Insufficient measured duration history',
            description: `At least 3 runs with both planned and measured duration are provisionally required; ${measuredSampleCount} eligible measured runs were found. This threshold is not a validated manufacturing rule.`,
            suggestedBufferPct: null,
          },
    };
  }
}
