import { PrismaClient } from '@prisma/client';
import { db } from '@/server/db/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { CreateNcrSchema, ResolveNcrSchema } from '../engineering/change-contracts';

export class NcrService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Creates a Non-Conformance Report (NCR) for defective units or process deviation.
   */
  async createNcr(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['quality.inspect', 'quality.read', 'task.execute_assigned']);
    const input = CreateNcrSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'quality.ncr.create',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const count = await tx.nonConformanceReport.count({ where: { workspaceId } });
        const ncrNumber = `NCR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

        const ncr = await tx.nonConformanceReport.create({
          data: {
            workspaceId,
            ncrNumber,
            title: input.title,
            description: input.description,
            severity: input.severity,
            status: 'OPEN',
            taskId: input.taskId,
            inspectionId: input.inspectionId,
            ownerUserId: input.ownerUserId || principal.userId,
          },
        });

        return {
          data: ncr,
          aggregateType: 'NON_CONFORMANCE_REPORT',
          aggregateId: ncr.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Records containment and corrective action investigation for an NCR.
   */
  async resolveNcr(
    principal: Principal,
    ncrId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['quality.inspect', 'engineering.write']);
    const input = ResolveNcrSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'quality.ncr.resolve',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { ncrId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const ncr = await tx.nonConformanceReport.findUnique({
          where: { workspaceId_id: { workspaceId, id: ncrId } },
        });
        if (!ncr) throw new NotFoundError(`NCR '${ncrId}' not found`);

        const updated = await tx.nonConformanceReport.update({
          where: { workspaceId_id: { workspaceId, id: ncrId } },
          data: {
            status: 'CORRECTED',
            rootCause: input.rootCause,
            containmentAction: input.containmentAction,
            correctiveAction: input.correctiveAction,
            resolvedAt: new Date(),
          },
        });

        return {
          data: updated,
          aggregateType: 'NON_CONFORMANCE_REPORT',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Final verification and formal closure of an NCR.
   */
  async closeNcr(
    principal: Principal,
    ncrId: string,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['quality.inspect', 'quality.configure']);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'quality.ncr.close',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { ncrId },
      prismaClient: this.db,
      handler: async (tx) => {
        const ncr = await tx.nonConformanceReport.findUnique({
          where: { workspaceId_id: { workspaceId, id: ncrId } },
        });
        if (!ncr) throw new NotFoundError(`NCR '${ncrId}' not found`);
        if (ncr.status !== 'CORRECTED') {
          throw new BadRequestError(`NCR '${ncrId}' cannot be closed before corrective actions are documented (current status: ${ncr.status})`);
        }

        const closed = await tx.nonConformanceReport.update({
          where: { workspaceId_id: { workspaceId, id: ncrId } },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        return {
          data: closed,
          aggregateType: 'NON_CONFORMANCE_REPORT',
          aggregateId: closed.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Lists all NCRs in workspace.
   */
  async listNcrs(principal: Principal) {
    requireAnyPermission(principal, ['quality.read', 'quality.inspect']);
    return this.db.nonConformanceReport.findMany({
      where: { workspaceId: principal.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const ncrService = new NcrService(db);
