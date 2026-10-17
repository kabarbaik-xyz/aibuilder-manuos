import { PrismaClient } from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { Principal } from '@/server/auth/principal';
import { executeCommand } from '@/server/db/transaction';
import { completeLifecycleAction } from './service';

const permissionByAction: Record<string, string> = {
  ORDER_CONFIRM: 'order.create',
  ENGINEERING_APPROVE: 'engineering.approve',
  PLAN_PRODUCTION: 'planning.write',
  EXECUTE_PRODUCTION: 'task.execute_assigned',
  FINALIZE_QC: 'quality.inspect',
  CONFIRM_DELIVERY: 'delivery.dispatch',
  REVIEW_EVIDENCE: 'order.read',
};

export async function claimLifecycleStage(
  db: PrismaClient,
  principal: Principal,
  input: { stageId: string; expectedVersion: number },
  idempotencyKey: string
) {
  return executeCommand({
    principal,
    commandType: 'order_lifecycle.stage.claim',
    idempotencyKey,
    expectedVersion: input.expectedVersion,
    payload: input,
    prismaClient: db,
    handler: async (tx) => {
      const stage = await tx.orderLifecycleStage.findFirst({
        where: { id: input.stageId, workspaceId: principal.workspaceId },
        include: { instance: { select: { id: true, status: true, order: { select: { facilityId: true } } } } },
      });
      if (!stage || stage.instance.status !== 'ACTIVE') throw new NotFoundError('Lifecycle stage not found.');
      if (!principal.permissions.has(permissionByAction[stage.action] ?? '')) {
        throw new ForbiddenError('You do not have permission to claim this stage.');
      }
      const assignment = JSON.parse(stage.assignmentJson) as
        | { kind: 'MEMBER'; membershipId: string }
        | { kind: 'DEPARTMENT_QUEUE'; departmentId: string; eligibleRoleCodes: string[] };
      if (assignment.kind !== 'DEPARTMENT_QUEUE') throw new ConflictError('This stage is assigned to a specific person.');
      const membership = await tx.membership.findFirst({
        where: { id: principal.membershipId, workspaceId: principal.workspaceId, userId: principal.userId, status: 'ACTIVE' },
        include: { roles: { where: { role: { isActive: true } }, select: { role: { select: { code: true } } } } },
      });
      const currentRoleCodes = membership?.roles.map((grant: { role: { code: string } }) => grant.role.code) ?? [];
      if (membership?.departmentId !== assignment.departmentId || !assignment.eligibleRoleCodes.some((role) => currentRoleCodes.includes(role))) {
        throw new ForbiddenError('You are not eligible for this department queue.');
      }
      const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
      const facilityId = stage.instance.order.facilityId;
      if (!principal.roles.includes('OWNER') && (!facilityId || !facilityIds.includes(facilityId))) {
        throw new ForbiddenError('This stage is outside your facility scope.');
      }
      if (!membership) throw new ForbiddenError('An active department membership is required to claim work.');
      if (stage.assignedMembershipId) {
        if (stage.assignedMembershipId !== membership.id) throw new ConflictError('This stage has already been claimed.');
        return { data: { stageId: stage.id, assignedMembershipId: membership.id, version: stage.version }, aggregateType: 'OrderLifecycleStage', aggregateId: stage.id, previousVersion: stage.version, resourceVersion: stage.version };
      }
      if (stage.state !== 'READY') throw new ConflictError('Only ready lifecycle stages can be claimed.');
      const updated = await tx.orderLifecycleStage.updateMany({
        where: { id: stage.id, workspaceId: principal.workspaceId, version: input.expectedVersion, state: 'READY', assignedMembershipId: null },
        data: { assignedMembershipId: membership.id, state: 'ACTIVE', startedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictError('This stage changed or was claimed by another person. Refresh and try again.');
      await tx.orderLifecycleEvent.create({
        data: {
          workspaceId: principal.workspaceId,
          instanceId: stage.instance.id,
          stageId: stage.id,
          eventType: 'STAGE_CLAIMED',
          fromState: stage.state,
          toState: 'ACTIVE',
          actorUserId: principal.userId,
          commandId: idempotencyKey,
          detailJson: JSON.stringify({ assignedMembershipId: membership.id }),
        },
      });
      const data = { stageId: stage.id, assignedMembershipId: membership.id, version: stage.version + 1 };
      return { data, aggregateType: 'OrderLifecycleStage', aggregateId: stage.id, previousVersion: stage.version, resourceVersion: data.version, auditDetails: { action: 'claim', instanceId: stage.instance.id } };
    },
  });
}

/** Completes an evidence-review stage without inventing a separate operational side effect. */
export async function completeEvidenceReviewStage(
  db: PrismaClient,
  principal: Principal,
  input: { stageId: string; expectedVersion: number },
  idempotencyKey: string
) {
  if (!principal.permissions.has('order.read')) throw new ForbiddenError('You do not have permission to review order evidence.');
  return executeCommand({
    principal,
    commandType: 'order_lifecycle.stage.review_evidence',
    idempotencyKey,
    payload: input,
    prismaClient: db,
    handler: async (tx) => {
      const stage = await tx.orderLifecycleStage.findFirst({
        where: { id: input.stageId, workspaceId: principal.workspaceId },
        include: { instance: { select: { id: true, status: true, order: { select: { id: true, facilityId: true } } } } },
      });
      if (!stage || stage.instance.status !== 'ACTIVE') throw new NotFoundError('Lifecycle stage not found.');
      if (stage.action !== 'REVIEW_EVIDENCE') throw new BadRequestError('Only evidence-review stages can be completed directly.');
      const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
      if (!principal.roles.includes('OWNER') && (!stage.instance.order.facilityId || !facilityIds.includes(stage.instance.order.facilityId))) {
        throw new ForbiddenError('This stage is outside your facility scope.');
      }
      if (!['READY', 'ACTIVE'].includes(stage.state)) throw new ConflictError('Only a ready or active evidence-review stage can be completed.');
      await completeLifecycleAction(tx, {
        workspaceId: principal.workspaceId,
        orderId: stage.instance.order.id,
        action: 'REVIEW_EVIDENCE',
        actorUserId: principal.userId,
        commandId: idempotencyKey,
        stageId: stage.id,
        expectedStageVersion: input.expectedVersion,
      });
      const data = { stageId: stage.id, state: 'COMPLETED' as const };
      return { data, aggregateType: 'OrderLifecycleStage', aggregateId: stage.id, previousVersion: stage.version, resourceVersion: stage.version + 1, auditDetails: { action: 'review_evidence', instanceId: stage.instance.id } };
    },
  });
}
