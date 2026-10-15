import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { instantiateWorkflow, InstantiationResult } from '@/server/modules/workflow/instantiate';

export async function releaseOrder(
  principal: Principal,
  orderId: string,
  idempotencyKey: string,
  prisma: PrismaClient = defaultDb
) {
  requirePermission(principal, 'order.release');

  return executeCommand<any, InstantiationResult>({
    principal,
    commandType: 'order.release',
    idempotencyKey,
    payload: { orderId },
    prismaClient: prisma,
    handler: async (tx) => {
      // 1. Fetch order with relations
      const order = await tx.order.findFirst({
        where: { id: orderId, workspaceId: principal.workspaceId },
        include: {
          customer: true,
          item: true,
          orderType: true,
          engineeringRevisions: {
            orderBy: { revisionNumber: 'desc' },
            include: {
              bomLines: true,
            },
          },
        },
      });

      if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

      if (order.status === 'RELEASED' || order.status === 'IN_PRODUCTION') {
        // Idempotent retry: retrieve existing instance
        const approvedRev = order.engineeringRevisions.find((r: any) => r.status === 'APPROVED');
        if (approvedRev && approvedRev.workflowVersionId) {
          const wfVer = await tx.workflowVersion.findFirst({
            where: { id: approvedRev.workflowVersionId, workspaceId: principal.workspaceId },
            include: { nodes: true, edges: true },
          });
          const existingResult = await instantiateWorkflow({
            tx,
            principal,
            order,
            publishedVersion: wfVer,
            engineeringRevision: approvedRev,
            idempotencyKey,
          });

          return {
            data: existingResult,
            aggregateType: 'ORDER',
            aggregateId: order.id,
            resourceVersion: order.version,
          };
        }
      }

      // Check customer & item status
      if (!order.customer.isActive || order.customer.archivedAt) {
        throw new BadRequestError(`Customer '${order.customer.code}' is inactive or archived`);
      }
      if (!order.item.isActive || order.item.archivedAt) {
        throw new BadRequestError(`Item '${order.item.code}' is inactive or archived`);
      }

      // Check approved engineering revision
      const approvedRev = order.engineeringRevisions.find((r: any) => r.status === 'APPROVED');
      if (!approvedRev) {
        throw new BadRequestError(
          `Order '${orderId}' has no APPROVED engineering revision. Engineering review and approval is required before release.`
        );
      }

      if (!approvedRev.workflowVersionId) {
        throw new BadRequestError(
          `Approved engineering revision '${approvedRev.id}' does not specify a workflow version.`
        );
      }

      // Fetch published workflow version with its nodes & edges
      const publishedVersion = await tx.workflowVersion.findFirst({
        where: { id: approvedRev.workflowVersionId, workspaceId: principal.workspaceId },
        include: {
          nodes: true,
          edges: true,
        },
      });

      if (!publishedVersion || publishedVersion.status !== 'PUBLISHED') {
        throw new BadRequestError(
          `Workflow version '${approvedRev.workflowVersionId}' is not found or not in PUBLISHED status.`
        );
      }

      // Instantiate workflow atomically
      const result = await instantiateWorkflow({
        tx,
        principal,
        order,
        publishedVersion,
        engineeringRevision: approvedRev,
        idempotencyKey,
      });

      return {
        data: result,
        aggregateType: 'ORDER',
        aggregateId: order.id,
        resourceVersion: order.version + 1,
      };
    },
  });
}
