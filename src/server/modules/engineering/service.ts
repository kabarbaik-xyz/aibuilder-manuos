import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import * as contracts from './contracts';

export class EngineeringService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  async getEngineeringRevision(principal: Principal, revisionId: string) {
    requirePermission(principal, 'engineering.read');

    const revision = await this.prisma.engineeringRevision.findFirst({
      where: { id: revisionId, workspaceId: principal.workspaceId },
      include: {
        order: {
          include: {
            customer: true,
            item: true,
            orderType: true,
            questions: true,
          },
        },
        bomLines: {
          include: {
            item: true,
            inputUom: true,
          },
        },
      },
    });

    if (!revision) throw new NotFoundError(`Engineering revision '${revisionId}' not found`);
    return revision;
  }

  async saveEngineeringDraft(
    principal: Principal,
    revisionId: string,
    input: contracts.SaveEngineeringDraftInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'engineering.write');

    return executeCommand({
      principal,
      commandType: 'engineering.draft.save',
      idempotencyKey,
      payload: { revisionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const rev = await tx.engineeringRevision.findFirst({
          where: { id: revisionId, workspaceId: principal.workspaceId },
          include: { order: true },
        });
        if (!rev) throw new NotFoundError(`Engineering revision '${revisionId}' not found`);

        if (rev.status !== 'DRAFT') {
          throw new ConflictError(
            `Engineering revision '${revisionId}' has status '${rev.status}' and is immutable. Create a new revision to make modifications.`
          );
        }

        if (input.expectedVersion && input.expectedVersion !== rev.version) {
          throw new ConflictError('STALE_VERSION: Engineering revision was updated by another process.');
        }

        // Validate workflow version if provided
        if (input.workflowVersionId) {
          const wfVer = await tx.workflowVersion.findFirst({
            where: { id: input.workflowVersionId, workspaceId: principal.workspaceId },
            include: { nodes: true },
          });
          if (!wfVer) {
            throw new BadRequestError(`Workflow version '${input.workflowVersionId}' not found`);
          }

          // Validate that BOM lines reference existing nodes in workflow
          const validNodeKeys = new Set(wfVer.nodes.map((n: any) => n.key));
          for (const line of input.bomLines || []) {
            if (!validNodeKeys.has(line.operationNodeKey)) {
              throw new BadRequestError(
                `BOM line references operation node '${line.operationNodeKey}' which does not exist in workflow version '${input.workflowVersionId}'`
              );
            }
          }
        }

        // Validate BOM items and UOMs
        for (const line of input.bomLines || []) {
          const item = await tx.item.findFirst({
            where: { id: line.itemId, workspaceId: principal.workspaceId, archivedAt: null },
          });
          if (!item) throw new BadRequestError(`BOM item '${line.itemId}' not found or archived`);

          const uom = await tx.uom.findFirst({
            where: { id: line.inputUomId, workspaceId: principal.workspaceId, isActive: true },
          });
          if (!uom) throw new BadRequestError(`UOM '${line.inputUomId}' not found or inactive`);

          // Verify conversion exists if UOM is different from base UOM
          if (item.baseUomId !== line.inputUomId) {
            const conv = await tx.itemUomConversion.findUnique({
              where: {
                workspaceId_itemId_inputUomId: {
                  workspaceId: principal.workspaceId,
                  itemId: line.itemId,
                  inputUomId: line.inputUomId,
                },
              },
            });
            if (!conv) {
              throw new BadRequestError(
                `Missing conversion between UOM '${uom.code}' and item '${item.code}' base UOM.`
              );
            }
          }
        }

        // Replace BOM lines atomically
        await tx.bomLine.deleteMany({
          where: { workspaceId: principal.workspaceId, engineeringRevisionId: revisionId },
        });

        const outputBasisAtoms = BigInt(Math.round((input.outputBasis || 1) * 1_000_000));

        for (const line of input.bomLines || []) {
          const requirementAtoms = BigInt(Math.round(line.requirementQuantity * 1_000_000));
          const lineBasisAtoms = BigInt(Math.round((line.outputBasis || 1) * 1_000_000));

          await tx.bomLine.create({
            data: {
              workspaceId: principal.workspaceId,
              engineeringRevisionId: revisionId,
              operationNodeKey: line.operationNodeKey,
              itemId: line.itemId,
              inputUomId: line.inputUomId,
              requirementAtoms,
              outputBasisAtoms: lineBasisAtoms,
              allowancePercent: line.allowancePercent || 0.0,
            },
          });
        }

        const updated = await tx.engineeringRevision.update({
          where: { id: revisionId },
          data: {
            specsJson: JSON.stringify(input.specs || {}),
            workflowVersionId: input.workflowVersionId ?? rev.workflowVersionId,
            outputBasisAtoms,
            version: { increment: 1 },
          },
          include: {
            bomLines: {
              include: {
                item: true,
                inputUom: true,
              },
            },
          },
        });

        return {
          data: updated,
          aggregateType: 'ENGINEERING_REVISION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async submitEngineeringReview(principal: Principal, revisionId: string, idempotencyKey: string) {
    requirePermission(principal, 'engineering.write');

    return executeCommand({
      principal,
      commandType: 'engineering.review.submit',
      idempotencyKey,
      payload: { revisionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const rev = await tx.engineeringRevision.findFirst({
          where: { id: revisionId, workspaceId: principal.workspaceId },
          include: { order: { include: { questions: true } } },
        });
        if (!rev) throw new NotFoundError(`Engineering revision '${revisionId}' not found`);

        if (rev.status !== 'DRAFT') {
          throw new ConflictError(`Cannot submit review for revision in status '${rev.status}'. Must be in 'DRAFT'.`);
        }

        // Check unresolved questions
        const openQuestions = rev.order.questions.filter((q: any) => q.status === 'OPEN');
        if (openQuestions.length > 0) {
          throw new BadRequestError(
            `Cannot submit engineering review: order has ${openQuestions.length} unresolved customer question(s).`
          );
        }

        const updated = await tx.engineeringRevision.update({
          where: { id: revisionId },
          data: {
            status: 'REVIEW',
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'ENGINEERING_REVISION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async approveEngineeringRevision(principal: Principal, revisionId: string, idempotencyKey: string) {
    requirePermission(principal, 'engineering.approve');

    return executeCommand({
      principal,
      commandType: 'engineering.revision.approve',
      idempotencyKey,
      payload: { revisionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const rev = await tx.engineeringRevision.findFirst({
          where: { id: revisionId, workspaceId: principal.workspaceId },
          include: { order: { include: { questions: true } } },
        });
        if (!rev) throw new NotFoundError(`Engineering revision '${revisionId}' not found`);

        if (rev.status === 'APPROVED') {
          return {
            data: rev,
            aggregateType: 'ENGINEERING_REVISION',
            aggregateId: rev.id,
            resourceVersion: rev.version,
          };
        }

        if (rev.status !== 'DRAFT' && rev.status !== 'REVIEW') {
          throw new ConflictError(`Cannot approve revision in status '${rev.status}'.`);
        }

        // Validate workflow version is published
        if (!rev.workflowVersionId) {
          throw new BadRequestError('Cannot approve engineering revision without an assigned workflow version');
        }

        const wfVer = await tx.workflowVersion.findFirst({
          where: { id: rev.workflowVersionId, workspaceId: principal.workspaceId },
        });
        if (!wfVer || wfVer.status !== 'PUBLISHED') {
          throw new BadRequestError(
            `Assigned workflow version '${rev.workflowVersionId}' must be in PUBLISHED status before engineering approval.`
          );
        }

        // Ensure no open customer questions
        const openQuestions = rev.order.questions.filter((q: any) => q.status === 'OPEN');
        if (openQuestions.length > 0) {
          throw new BadRequestError(
            `Cannot approve engineering revision: order has ${openQuestions.length} unresolved customer question(s).`
          );
        }

        const updated = await tx.engineeringRevision.update({
          where: { id: revisionId },
          data: {
            status: 'APPROVED',
            approvedById: principal.userId,
            approvedAt: new Date(),
            version: { increment: 1 },
          },
        });

        // Advance Order status to READY if it is currently in DRAFT
        if (rev.order.status === 'DRAFT' || rev.order.status === 'REVIEW') {
          await tx.order.update({
            where: { id: rev.orderId },
            data: { status: 'READY', version: { increment: 1 } },
          });
        }

        return {
          data: updated,
          aggregateType: 'ENGINEERING_REVISION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }
}

export const engineeringService = new EngineeringService();
