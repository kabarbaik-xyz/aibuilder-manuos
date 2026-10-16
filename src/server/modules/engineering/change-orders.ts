import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import {
  CreateOrderChangeRequestSchema,
  ApproveOrderChangeRequestSchema,
  CreateEngineeringChangeOrderSchema,
  ApproveEngineeringChangeOrderSchema,
} from './change-contracts';

export class ChangeOrderService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Creates an order change request (OCR) in DRAFT/SUBMITTED status.
   */
  async createOrderChangeRequest(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['order.create', 'order.release', 'customer_order.read_own', 'sales']);
    const input = CreateOrderChangeRequestSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'order.change_request.create',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const order = await tx.order.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.orderId } },
        });
        if (!order) throw new NotFoundError(`Order '${input.orderId}' not found`);

        const count = await tx.orderChangeRequest.count({ where: { workspaceId } });
        const requestNumber = `OCR-${String(count + 1).padStart(4, '0')}`;

        const ocr = await tx.orderChangeRequest.create({
          data: {
            workspaceId,
            orderId: order.id,
            requestNumber,
            changeType: input.changeType,
            status: 'SUBMITTED',
            reason: input.reason,
            requestedChangesJson: JSON.stringify(input.requestedChanges),
            submittedAt: new Date(),
          },
        });

        return {
          data: ocr,
          aggregateType: 'ORDER_CHANGE_REQUEST',
          aggregateId: ocr.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Approves and applies an order change request.
   */
  async approveOrderChangeRequest(
    principal: Principal,
    requestId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['order.release', 'order.cancel', 'planning.write']);
    const input = ApproveOrderChangeRequestSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'order.change_request.approve',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { requestId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const ocr = await tx.orderChangeRequest.findUnique({
          where: { workspaceId_id: { workspaceId, id: requestId } },
          include: { order: true },
        });
        if (!ocr) throw new NotFoundError(`Order change request '${requestId}' not found`);
        if (ocr.status === 'APPROVED' || ocr.status === 'APPLIED') {
          return { data: ocr, aggregateType: 'ORDER_CHANGE_REQUEST', aggregateId: ocr.id, resourceVersion: 1 };
        }

        const changes = JSON.parse(ocr.requestedChangesJson || '{}');
        const updateData: Record<string, any> = { version: { increment: 1 } };

        if (ocr.changeType === 'DATE' && changes.requestedDate) {
          updateData.requestedDate = new Date(changes.requestedDate);
        }

        if (ocr.changeType === 'CANCEL') {
          updateData.status = 'CANCELLED';
        }

        await tx.order.update({
          where: { workspaceId_id: { workspaceId, id: ocr.orderId } },
          data: updateData,
        });

        const updated = await tx.orderChangeRequest.update({
          where: { workspaceId_id: { workspaceId, id: requestId } },
          data: {
            status: 'APPLIED',
            approvedAt: new Date(),
            approvedByUserId: principal.userId,
            appliedAt: new Date(),
          },
        });

        return {
          data: updated,
          aggregateType: 'ORDER_CHANGE_REQUEST',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Creates an Engineering Change Order (ECO).
   */
  async createEngineeringChangeOrder(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['engineering.write', 'workflow.author']);
    const input = CreateEngineeringChangeOrderSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'engineering.change_order.create',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const sourceRev = await tx.engineeringRevision.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.sourceRevisionId } },
        });
        if (!sourceRev) throw new NotFoundError(`Source revision '${input.sourceRevisionId}' not found`);

        const activeJobsCount = await tx.jobsheet.count({
          where: {
            workspaceId,
            instructionRevision: sourceRev.revisionNumber,
          },
        });

        const eco = await tx.engineeringChangeOrder.create({
          data: {
            workspaceId,
            code: input.code,
            title: input.title,
            description: input.description,
            sourceRevisionId: input.sourceRevisionId,
            targetRevisionId: input.targetRevisionId,
            status: 'DRAFT',
            migrationPolicy: input.migrationPolicy,
            impactedJobsCount: activeJobsCount,
          },
        });

        return {
          data: eco,
          aggregateType: 'ENGINEERING_CHANGE_ORDER',
          aggregateId: eco.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Approves and applies an ECO to running active jobsheets.
   */
  async approveAndApplyECO(
    principal: Principal,
    ecoId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['engineering.approve', 'order.release']);
    const input = ApproveEngineeringChangeOrderSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'engineering.change_order.apply',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { ecoId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const eco = await tx.engineeringChangeOrder.findUnique({
          where: { workspaceId_id: { workspaceId, id: ecoId } },
        });
        if (!eco) throw new NotFoundError(`Engineering Change Order '${ecoId}' not found`);

        let targetRevNumber = 2;
        if (eco.targetRevisionId) {
          const targetRev = await tx.engineeringRevision.findUnique({
            where: { workspaceId_id: { workspaceId, id: eco.targetRevisionId } },
          });
          if (targetRev) targetRevNumber = targetRev.revisionNumber;
        }

        const sourceRev = await tx.engineeringRevision.findUnique({
          where: { workspaceId_id: { workspaceId, id: eco.sourceRevisionId } },
        });

        if (eco.migrationPolicy === 'RUNNING_JOBS_MIGRATE' && sourceRev) {
          await tx.jobsheet.updateMany({
            where: {
              workspaceId,
              instructionRevision: sourceRev.revisionNumber,
            },
            data: {
              instructionRevision: targetRevNumber,
            },
          });
        }

        const updated = await tx.engineeringChangeOrder.update({
          where: { workspaceId_id: { workspaceId, id: ecoId } },
          data: {
            status: 'APPLIED',
            approvedAt: new Date(),
            approvedByUserId: principal.userId,
            appliedAt: new Date(),
          },
        });

        return {
          data: updated,
          aggregateType: 'ENGINEERING_CHANGE_ORDER',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }
}
