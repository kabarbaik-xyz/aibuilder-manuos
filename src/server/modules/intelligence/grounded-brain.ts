import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError, BadRequestError } from '@/domain/errors';

export interface GroundedEvidenceQuery {
  entityType: 'ORDER' | 'TASK' | 'ITEM';
  entityId: string;
  maxTokensBudget?: number;
}

export interface GroundedEvidenceDTO {
  entityType: 'ORDER' | 'TASK' | 'ITEM';
  entityId: string;
  codeOrNumber: string;
  status: string;
  authoritativeFacts: Record<string, unknown>;
  referencedEvidenceIds: string[];
  caveats: string[];
  modelVersion: string;
  promptVersion: string;
  contextVersion: number;
  tokenBudget: number;
  sourceTimestamp: string;
  generatedAt: string;
}

export interface BrainFeedbackRecord {
  id: string;
  workspaceId: string;
  userId: string;
  entityType: 'ORDER' | 'TASK' | 'ITEM';
  entityId: string;
  rating: 'ACCURATE' | 'FACTUAL_CORRECTION';
  correctionNote?: string;
  recordedAt: string;
}

export class GroundedBrainService {
  private static feedbackStore = new Map<string, BrainFeedbackRecord[]>();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves strictly verified, non-hallucinated evidence for operational entities.
   * Enforces tenant isolation, valid reference IDs, and explicitly enumerates missing data caveats.
   */
  async getGroundedEvidence(
    principal: Principal,
    query: GroundedEvidenceQuery
  ): Promise<GroundedEvidenceDTO> {
    requireAnyPermission(principal, ['planning.read', 'execution.read', 'quality.read', 'owner']);

    const workspaceId = principal.workspaceId;
    const caveats: string[] = [];
    const referencedEvidenceIds: string[] = [];
    const tokenBudget = Math.min(Math.max(query.maxTokensBudget ?? 1024, 128), 4096);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { revision: true, updatedAt: true },
    });
    const contextVersion = workspace?.revision ?? 1;

    if (query.entityType === 'ORDER') {
      const order = await this.prisma.order.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: query.entityId,
          },
        },
        include: {
          customer: true,
          instances: {
            include: {
              tasks: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundError(`Order ${query.entityId} does not exist in workspace.`);
      }

      referencedEvidenceIds.push(order.id);
      const allTasks = order.instances.flatMap((inst) => inst.tasks);
      allTasks.forEach((t) => referencedEvidenceIds.push(t.id));

      if (!order.promisedDate) {
        caveats.push('Order does not have a confirmed promised date.');
      }

      const tasksCompleted = allTasks.filter((t) => t.status === 'COMPLETED').length;

      return {
        entityType: 'ORDER',
        entityId: order.id,
        codeOrNumber: order.orderNumber,
        status: order.status,
        authoritativeFacts: {
          customerName: order.customer?.name || 'Unknown',
          promisedDate: order.promisedDate?.toISOString() || null,
          totalTasks: allTasks.length,
          completedTasks: tasksCompleted,
          isFullyCompleted: order.status === 'COMPLETED' || order.status === 'DELIVERED',
        },
        referencedEvidenceIds,
        caveats,
        modelVersion: 'grounded-deterministic-v1',
        promptVersion: 'brain-evidence-v2',
        contextVersion,
        tokenBudget,
        sourceTimestamp: order.updatedAt.toISOString(),
        generatedAt: new Date().toISOString(),
      };
    } else if (query.entityType === 'TASK') {
      const task = await this.prisma.task.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: query.entityId,
          },
        },
        include: {
          instance: {
            include: {
              order: true,
            },
          },
          issues: true,
        },
      });

      if (!task) {
        throw new NotFoundError(`Task ${query.entityId} does not exist in workspace.`);
      }

      referencedEvidenceIds.push(task.id);
      task.issues.forEach((i) => referencedEvidenceIds.push(i.id));

      const openIssues = task.issues.filter((i) => i.status !== 'RESOLVED');
      if (openIssues.length > 0) {
        caveats.push(`Task has ${openIssues.length} unresolved issue(s) blocking or impacting progress.`);
      }

      return {
        entityType: 'TASK',
        entityId: task.id,
        codeOrNumber: task.nodeKey,
        status: task.status,
        authoritativeFacts: {
          orderNumber: task.instance?.order?.orderNumber || null,
          nodeKey: task.nodeKey,
          attemptNumber: task.attemptNumber,
          plannedDurationMinutes: task.plannedDurationMinutes,
          actualDurationMinutes: task.actualDurationMinutes,
          activeIssuesCount: openIssues.length,
        },
        referencedEvidenceIds,
        caveats,
        modelVersion: 'grounded-deterministic-v1',
        promptVersion: 'brain-evidence-v2',
        contextVersion,
        tokenBudget,
        sourceTimestamp: task.updatedAt.toISOString(),
        generatedAt: new Date().toISOString(),
      };
    } else if (query.entityType === 'ITEM') {
      const item = await this.prisma.item.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: query.entityId,
          },
        },
      });

      if (!item) {
        throw new NotFoundError(`Item ${query.entityId} does not exist in workspace.`);
      }

      referencedEvidenceIds.push(item.id);

      const balances = await this.prisma.stockBalance.findMany({
        where: {
          workspaceId,
          itemId: item.id,
        },
      });

      let totalOnHand = 0n;
      let totalReserved = 0n;
      for (const b of balances) {
        totalOnHand += b.onHandAtoms;
        totalReserved += b.reservedAtoms;
      }

      return {
        entityType: 'ITEM',
        entityId: item.id,
        codeOrNumber: item.code,
        status: 'ACTIVE',
        authoritativeFacts: {
          name: item.name,
          itemType: item.itemType,
          totalOnHandUnits: Number(totalOnHand / 1000000n),
          totalReservedUnits: Number(totalReserved / 1000000n),
          availableUnits: Number((totalOnHand - totalReserved) / 1000000n),
        },
        referencedEvidenceIds,
        caveats,
        modelVersion: 'grounded-deterministic-v1',
        promptVersion: 'brain-evidence-v2',
        contextVersion,
        tokenBudget,
        sourceTimestamp: item.updatedAt.toISOString(),
        generatedAt: new Date().toISOString(),
      };
    }

    throw new BadRequestError(`Unsupported entityType: ${query.entityType}`);
  }

  /**
   * Records factual correction or accuracy feedback on grounded Brain evidence without storing PII.
   */
  async recordFeedback(
    principal: Principal,
    input: {
      entityType: 'ORDER' | 'TASK' | 'ITEM';
      entityId: string;
      rating: 'ACCURATE' | 'FACTUAL_CORRECTION';
      correctionNote?: string;
    }
  ): Promise<BrainFeedbackRecord> {
    requireAnyPermission(principal, ['planning.read', 'execution.read', 'quality.read', 'owner']);
    await this.getGroundedEvidence(principal, {
      entityType: input.entityType,
      entityId: input.entityId,
    });

    const record: BrainFeedbackRecord = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      rating: input.rating,
      correctionNote: input.correctionNote?.slice(0, 500),
      recordedAt: new Date().toISOString(),
    };

    const existing = GroundedBrainService.feedbackStore.get(principal.workspaceId) || [];
    existing.push(record);
    GroundedBrainService.feedbackStore.set(principal.workspaceId, existing);

    return record;
  }
}
