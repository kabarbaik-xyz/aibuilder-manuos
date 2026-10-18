import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { instantiateWorkflow, InstantiationResult } from '@/server/modules/workflow/instantiate';
import { assertRequiredFormsFinalized } from '@/server/modules/forms/completion';
import { NotificationService } from '@/server/modules/notifications/service';

export interface OrderReleaseResult extends InstantiationResult {
  jobs: InstantiationResult[];
}

export async function releaseOrder(
  principal: Principal,
  orderId: string,
  idempotencyKey: string,
  prisma: PrismaClient = defaultDb
) {
  requirePermission(principal, 'order.release');

  return executeCommand<any, OrderReleaseResult>({
    principal,
    commandType: 'order.release',
    idempotencyKey,
    payload: { orderId },
    prismaClient: prisma,
    handler: async (tx) => {
      // Fetch line, item and engineering pins inside the release command.
      const order = await tx.order.findFirst({
        where: { id: orderId, workspaceId: principal.workspaceId },
        include: {
          customer: true,
          item: true,
          orderType: true,
          lines: {
            include: { item: true, uom: true },
            orderBy: { lineNumber: 'asc' },
          },
          engineeringRevisions: {
            orderBy: { revisionNumber: 'desc' },
            include: {
              bomLines: true,
            },
          },
        },
      });

      if (!order) throw new NotFoundError(`Order '${orderId}' not found`);
      if (order.status === 'CANCELLED') {
        throw new BadRequestError(`Cannot release cancelled order '${order.orderNumber}'.`);
      }
      if (!order.confirmedAt && order.status !== 'READY') {
        throw new BadRequestError(`Order '${order.orderNumber}' must be confirmed or READY after engineering approval before release.`);
      }
      if (!order.confirmedAt) {
        // The explicit, authorized release command is also a confirmation for
        // existing integrations that do not call the separate confirm route.
        await tx.order.update({
          where: { id: order.id },
          data: {
            confirmedAt: new Date(),
            confirmedById: principal.userId,
            version: { increment: 1 },
          },
        });
      }

      // Check customer and every line item before resolving engineering pins.
      if (!order.customer.isActive || order.customer.archivedAt) {
        throw new BadRequestError(`Customer '${order.customer.code}' is inactive or archived`);
      }
      for (const line of order.lines) {
        if (!line.item.isActive || line.item.archivedAt) {
          throw new BadRequestError(`Item '${line.item.code}' is inactive or archived`);
        }
      }

      const lineTargets = order.lines.map((line: any) => {
        const revisions = order.engineeringRevisions.filter((revision: any) =>
          revision.orderLineId === line.id ||
          (order.lines.length === 1 && revision.orderLineId === null)
        );
        const approvedRevision = revisions.find((revision: any) => revision.status === 'APPROVED');
        if (!approvedRevision) {
          throw new BadRequestError(
            `Order line '${line.lineNumber}' has no APPROVED engineering revision. Engineering review and approval is required before release.`
          );
        }
        if (!approvedRevision.workflowVersionId) {
          throw new BadRequestError(
            `Approved engineering revision '${approvedRevision.id}' does not specify a workflow version.`
          );
        }
        return { line, approvedRevision };
      });

      const releaseTargets: Array<{ line: any; revision: any; workflow: any; manufacturingOrders: any[] }> = [];
      for (const { line, approvedRevision } of lineTargets) {
        const publishedVersion = await tx.workflowVersion.findFirst({
          where: {
            id: approvedRevision.workflowVersionId,
            workspaceId: principal.workspaceId,
            status: 'PUBLISHED',
          },
          include: { nodes: true, edges: true, template: true },
        });
        if (!publishedVersion || publishedVersion.template.orderTypeId !== order.orderTypeId) {
          throw new BadRequestError(
            `Workflow version '${approvedRevision.workflowVersionId}' is not found or not in PUBLISHED status.`
          );
        }
        const allocatedJobs = await tx.manufacturingOrder.findMany({
          where: {
            workspaceId: principal.workspaceId,
            orderId: order.id,
            OR: [
              { orderLineId: line.id },
              ...(order.lines.length === 1 ? [{ orderLineId: null }] : []),
            ],
          },
          orderBy: { createdAt: 'asc' },
        });
        if (allocatedJobs.length) {
          const allocatedAtoms = allocatedJobs.reduce((total: bigint, job: any) => total + job.targetAtoms, 0n);
          if (allocatedAtoms !== line.orderedAtoms || line.allocatedAtoms !== allocatedAtoms) {
            throw new BadRequestError(
              `Order line '${line.lineNumber}' has inconsistent allocation totals (line ${line.allocatedAtoms}, jobs ${allocatedAtoms}); release requires exactly ${line.orderedAtoms} atoms.`
            );
          }
          for (const job of allocatedJobs) {
            if (job.status !== 'DRAFT' && job.status !== 'RELEASED' && job.status !== 'IN_PROGRESS') {
              throw new BadRequestError(`Manufacturing order '${job.moNumber}' cannot be released from status '${job.status}'.`);
            }
            if (job.engineeringRevisionId && job.engineeringRevisionId !== approvedRevision.id) {
              throw new BadRequestError(`Manufacturing order '${job.moNumber}' is pinned to a different engineering revision.`);
            }
            if (job.workflowVersionId && job.workflowVersionId !== publishedVersion.id) {
              throw new BadRequestError(`Manufacturing order '${job.moNumber}' is pinned to a different workflow version.`);
            }
          }
        }
        releaseTargets.push({
          line,
          revision: approvedRevision,
          workflow: publishedVersion,
          manufacturingOrders: allocatedJobs.length ? allocatedJobs : [null],
        });
      }

      // Verify all required order specification forms are finalized before release
      await assertRequiredFormsFinalized(tx, {
        workspaceId: principal.workspaceId,
        subjectType: 'ORDER',
        subjectId: order.id,
        completionPoint: 'BEFORE_ACTION',
      });

      // Each order line has an independent, pinned workflow and manufacturing target.
      const jobs: InstantiationResult[] = [];
      for (const target of releaseTargets) {
        for (const manufacturingOrder of target.manufacturingOrders) {
          if (manufacturingOrder?.orderLineId === null && order.lines.length === 1) {
            await tx.manufacturingOrder.update({
              where: { id: manufacturingOrder.id },
              data: { orderLineId: target.line.id },
            });
          }
          const jobAtoms = manufacturingOrder?.targetAtoms ?? target.line.orderedAtoms;
          jobs.push(await instantiateWorkflow({
            tx,
            principal,
            order: {
              ...order,
              itemId: target.line.itemId,
              orderedAtoms: jobAtoms,
            },
            orderLine: target.line,
            orderLineCount: order.lines.length,
            manufacturingOrder,
            publishedVersion: target.workflow,
            engineeringRevision: target.revision,
            idempotencyKey,
          }));
        }
      }
      const primary = jobs[0];
      if (!primary) throw new BadRequestError(`Order '${orderId}' has no lines to release`);
      const taskIds = Object.assign({}, ...jobs.map((job, index) => {
        const scoped = Object.fromEntries(
          Object.entries(job.taskIds).map(([nodeKey, taskId]) => [
            order.lines.length === 1 ? nodeKey : `L${String(order.lines[index].lineNumber).padStart(2, '0')}:${nodeKey}`,
            taskId,
          ])
        );
        return index === 0 ? { ...job.taskIds, ...scoped } : scoped;
      }));
      const result: OrderReleaseResult = {
        ...primary,
        taskIds,
        demandIds: jobs.flatMap((job) => job.demandIds),
        orderLineId: order.lines.length === 1 ? primary.orderLineId : null,
        jobs,
      };
      const releasedOrder = await tx.order.findFirst({
        where: { id: order.id, workspaceId: principal.workspaceId },
        select: { version: true },
      });

      await new NotificationService(tx).notifyFacilityMembers(principal.workspaceId, order.facilityId, 'planning.read', {
        category: 'RELEASE', title: `Order dirilis: ${order.orderNumber}`,
        body: `${jobs.length} job tersedia untuk penjadwalan.`, subjectType: 'ORDER', subjectId: order.id,
        dedupeKey: `order-release:${order.id}`,
      });

      return {
        data: result,
        aggregateType: 'ORDER',
        aggregateId: order.id,
        resourceVersion: releasedOrder?.version ?? order.version,
      };
    },
  });
}
