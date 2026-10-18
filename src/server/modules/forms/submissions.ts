import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Principal } from '@/server/auth/principal';
import { executeCommand } from '@/server/db/transaction';
import { FormPolicy } from './policy';
import { validateAnswers } from '@/domain/forms/validation';
import { FormDefinition, Answers } from '@/domain/forms/types';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  BadRequestError,
} from '@/domain/errors';

export interface SaveFormDraftInput {
  instanceId: string;
  expectedVersion: number;
  answers: Record<string, unknown>;
}

export interface FinalizeFormSubmissionInput {
  instanceId: string;
  expectedVersion: number;
  answers: Record<string, unknown>;
}

export interface CreateFormCorrectionInput {
  instanceId: string;
  expectedVersion: number;
  reason: string;
  answers: Record<string, unknown>;
}

export interface FormSubmissionDTO {
  id: string;
  instanceId: string;
  sequenceNumber: number;
  status: 'DRAFT' | 'FINAL';
  answers: Answers;
  actorId: string;
  finalizedAt: string | null;
  supersedesId: string | null;
  correctionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class FormSubmissionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listInstancesForSubject(
    principal: Principal,
    subjectType: 'ORDER' | 'TASK' | 'INSPECTION',
    subjectId: string
  ) {
    FormPolicy.requireRead(principal);
    const instances = await this.prisma.formInstance.findMany({
      where: { workspaceId: principal.workspaceId, subjectType, subjectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const readable = [];
    for (const instance of instances) {
      try {
        readable.push(await this.getInstance(principal, instance.id));
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return readable;
  }

  private async assertInstanceAccess(
    principal: Principal,
    instance: any,
    db: PrismaClient | Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    // 1. Check workspace matching
    if (instance.workspaceId !== principal.workspaceId) {
      throw new NotFoundError(`Form instance '${instance.id}' not found`);
    }

    // Re-read membership in the same transaction as a write. A session may
    // have been authenticated before the membership was disabled or moved.
    const membership = await db.membership.findFirst({
      where: {
        id: principal.membershipId,
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        status: 'ACTIVE',
      },
      include: {
        facilityGrants: { select: { facilityId: true } },
        roles: {
          where: { role: { isActive: true } },
          include: { role: { select: { code: true, permissions: { select: { permissionCode: true } } } } },
        },
      },
    });
    if (!membership) throw new ForbiddenError('An active workspace membership is required to access this form.');
    const roleCodes = membership.roles.map((grant) => grant.role.code);
    const permissions = new Set(membership.roles.flatMap((grant) => grant.role.permissions.map((permission) => permission.permissionCode)));
    const grantedFacilities = new Set([
      ...(membership.facilityId ? [membership.facilityId] : []),
      ...membership.facilityGrants.map((grant) => grant.facilityId),
    ]);
    const isOwner = roleCodes.includes('OWNER');

    // 2. Deny customer users from internal form submissions
    if (roleCodes.includes('CUSTOMER') && !isOwner) {
      throw new ForbiddenError('Customer users are not permitted to submit internal forms');
    }

    // 3. Subject-specific checks
    if (instance.subjectType === 'TASK') {
      const task = await db.task.findFirst({
        where: { id: instance.subjectId, workspaceId: principal.workspaceId },
        include: { instance: { select: { order: { select: { facilityId: true } } } } },
      });
      if (!task) {
        throw new NotFoundError(`Form instance '${instance.id}' not found`);
      }

      const hasWorkspaceOversight = isOwner || roleCodes.includes('ACCESS_ADMIN') || permissions.has('task.assign');
      const canReadAssignedTask = permissions.has('task.execute_assigned') ||
        permissions.has('task.read_assigned') || permissions.has('execution.read');
      const isAssignedTechnician = !!membership.technicianId && task.assignedTechnicianId === membership.technicianId;
      const facilityId = task.instance.order.facilityId;
      const facilityInScope = isOwner ||
        (facilityId ? grantedFacilities.has(facilityId) : hasWorkspaceOversight);

      if (!facilityInScope || (!hasWorkspaceOversight && (!canReadAssignedTask || !isAssignedTechnician))) {
        throw new ForbiddenError('Permission denied for task evidence form instance');
      }
    } else if (instance.subjectType === 'ORDER') {
      const order = await db.order.findFirst({
        where: { id: instance.subjectId, workspaceId: principal.workspaceId },
        select: { facilityId: true },
      });
      if (!order) throw new NotFoundError(`Form instance '${instance.id}' not found`);
      const canReadOrder = permissions.has('order.read') || isOwner;
      const facilityInScope = isOwner ||
        (order.facilityId ? grantedFacilities.has(order.facilityId) : false);
      if (!canReadOrder || !facilityInScope) {
        throw new ForbiddenError('Permission denied for order specification form instance');
      }
    } else if (instance.subjectType === 'INSPECTION') {
      const inspection = await db.inspection.findFirst({
        where: { id: instance.subjectId, workspaceId: principal.workspaceId },
        select: {
          inspectorUserId: true,
          productionOutput: {
            select: {
              task: {
                select: {
                  instance: { select: { order: { select: { facilityId: true } } } },
                },
              },
            },
          },
        },
      });
      if (!inspection) throw new NotFoundError(`Form instance '${instance.id}' not found`);
      const canInspect = permissions.has('quality.inspect') || isOwner;
      const facilityId = inspection.productionOutput?.task.instance.order.facilityId ?? null;
      const facilityInScope = isOwner ||
        (facilityId === null || grantedFacilities.has(facilityId));
      if (!canInspect || !facilityInScope || (inspection.inspectorUserId !== principal.userId && !isOwner)) {
        throw new ForbiddenError('Permission denied for quality inspection form instance');
      }
    } else {
      throw new ForbiddenError('Unsupported form subject');
    }
  }

  private async assertAnswerReferences(
    tx: Prisma.TransactionClient,
    principal: Principal,
    definition: FormDefinition,
    answers: Answers,
    subject: { subjectType: 'ORDER' | 'TASK' | 'INSPECTION'; subjectId: string }
  ): Promise<void> {
    const subjectFacilityId = subject.subjectType === 'ORDER'
      ? (await tx.order.findFirst({ where: { id: subject.subjectId, workspaceId: principal.workspaceId }, select: { facilityId: true } }))?.facilityId ?? null
      : subject.subjectType === 'TASK'
        ? (await tx.task.findFirst({
            where: { id: subject.subjectId, workspaceId: principal.workspaceId },
            select: { instance: { select: { order: { select: { facilityId: true } } } } },
          }))?.instance.order.facilityId ?? null
        : (await tx.inspection.findFirst({
            where: { id: subject.subjectId, workspaceId: principal.workspaceId },
            select: {
              productionOutput: {
                select: {
                  task: {
                    select: {
                      instance: { select: { order: { select: { facilityId: true } } } },
                    },
                  },
                },
              },
            },
          }))?.productionOutput?.task.instance.order.facilityId ?? null;

    for (const field of definition.fields) {
      const value = answers[field.key];
      if (field.kind === 'reference' && typeof value === 'string') {
        const where = { id: value, workspaceId: principal.workspaceId, archivedAt: null };
        const target = field.referenceType === 'customer'
          ? await tx.customer.findFirst({ where: { ...where, isActive: true }, select: { id: true } })
          : field.referenceType === 'machine'
            ? await tx.machine.findFirst({
                where: {
                  ...where,
                  OR: [{ facilityId: null }, ...(subjectFacilityId ? [{ facilityId: subjectFacilityId }] : [])],
                },
                select: { id: true },
              })
            : field.referenceType === 'item'
              ? await tx.item.findFirst({ where: { ...where, isActive: true }, select: { id: true } })
              : null;
        if (!target) throw new BadRequestError(`Reference for '${field.label}' is unavailable in this workspace.`);
      }

      if (field.kind === 'attachment' && Array.isArray(value)) {
        for (const documentId of value) {
          if (typeof documentId !== 'string') continue;
          const document = await tx.document.findFirst({
            where: {
              id: documentId,
              workspaceId: principal.workspaceId,
              OR: [
                { uploadedById: principal.userId, links: { none: {} } },
                { links: { some: { workspaceId: principal.workspaceId, parentType: subject.subjectType, parentId: subject.subjectId } } },
              ],
            },
            select: { id: true },
          });
          if (!document) throw new BadRequestError(`Attachment '${documentId}' is unavailable for this form subject.`);
        }
      }
    }
  }

  async getInstance(
    principal: Principal,
    instanceId: string
  ): Promise<{
    instance: any;
    definition: FormDefinition;
    latestSubmission: FormSubmissionDTO | null;
  }> {
    const instance = await this.prisma.formInstance.findFirst({
      where: { id: instanceId, workspaceId: principal.workspaceId },
      include: {
        formVersion: true,
        submissions: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!instance) {
      throw new NotFoundError(`Form instance '${instanceId}' not found`);
    }

    await this.assertInstanceAccess(principal, instance);

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const latest = instance.submissions[0];

    return {
      instance: {
        id: instance.id,
        workspaceId: instance.workspaceId,
        formVersionId: instance.formVersionId,
        formBindingId: instance.formBindingId,
        subjectType: instance.subjectType,
        subjectId: instance.subjectId,
        status: instance.status,
        version: instance.version,
        createdAt: instance.createdAt.toISOString(),
        updatedAt: instance.updatedAt.toISOString(),
      },
      definition,
      latestSubmission: latest
        ? {
            id: latest.id,
            instanceId: latest.instanceId,
            sequenceNumber: latest.sequenceNumber,
            status: latest.status as any,
            answers: JSON.parse(latest.answersJson),
            actorId: latest.actorId,
            finalizedAt: latest.finalizedAt ? latest.finalizedAt.toISOString() : null,
            supersedesId: latest.supersedesId,
            correctionReason: latest.correctionReason,
            version: latest.version,
            createdAt: latest.createdAt.toISOString(),
            updatedAt: latest.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async saveDraft(
    principal: Principal,
    input: SaveFormDraftInput,
    idempotencyKey: string = randomUUID()
  ): Promise<{ instanceId: string; submissionId: string; version: number }> {
    const instance = await this.prisma.formInstance.findFirst({
      where: { id: input.instanceId, workspaceId: principal.workspaceId },
      include: {
        formVersion: true,
        submissions: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!instance) {
      throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
    }

    await this.assertInstanceAccess(principal, instance);

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'DRAFT');

    // In DRAFT mode, unknown keys or invalid types produce validation error
    if (!validationRes.valid) {
      throw new ValidationError(
        `Draft validation failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const committed = await executeCommand({
      principal,
      commandType: 'forms.submission.save_draft',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
      const current = await tx.formInstance.findFirst({
        where: { id: instance.id, workspaceId: principal.workspaceId },
        include: { formVersion: true, submissions: { orderBy: { sequenceNumber: 'desc' }, take: 1 } },
      });
      if (!current) throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
      await this.assertInstanceAccess(principal, current, tx);
      await this.assertAnswerReferences(tx, principal, definition, validationRes.normalized, current);
      if (current.version !== input.expectedVersion || current.status === 'SUBMITTED') {
        throw new ConflictError(`Form instance '${input.instanceId}' changed or is already finalized`);
      }
      const claimed = await tx.formInstance.updateMany({
        where: { id: current.id, workspaceId: principal.workspaceId, version: input.expectedVersion, status: { not: 'SUBMITTED' } },
        data: { status: 'DRAFT', version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictError(`Form instance '${input.instanceId}' changed while saving`);

      let submissionId: string;

      const currentLatest = current.submissions[0];
      if (currentLatest?.status === 'DRAFT') {
        const updated = await tx.formSubmission.update({
          where: { id: currentLatest.id },
          data: {
            answersJson: JSON.stringify(validationRes.normalized),
            actorId: principal.userId,
            version: { increment: 1 },
          },
        });
        submissionId = updated.id;
      } else {
        const nextSeq = currentLatest ? currentLatest.sequenceNumber + 1 : 1;
        const created = await tx.formSubmission.create({
          data: {
            workspace: { connect: { id: principal.workspaceId } },
            instance: { connect: { id: instance.id } },
            sequenceNumber: nextSeq,
            status: 'DRAFT',
            answersJson: JSON.stringify(validationRes.normalized),
            actorId: principal.userId,
          },
        });
        submissionId = created.id;
      }

      const data = { instanceId: current.id, submissionId, version: input.expectedVersion + 1 };
      return { data, aggregateType: 'FormInstance', aggregateId: current.id, previousVersion: input.expectedVersion, resourceVersion: data.version, auditDetails: { subjectType: current.subjectType, subjectId: current.subjectId, submissionId } };
      },
    });

    return committed.data;
  }

  async finalizeSubmission(
    principal: Principal,
    input: FinalizeFormSubmissionInput,
    idempotencyKey: string = randomUUID()
  ): Promise<{ instanceId: string; submissionId: string; version: number }> {
    const instance = await this.prisma.formInstance.findFirst({
      where: { id: input.instanceId, workspaceId: principal.workspaceId },
      include: {
        formVersion: true,
        submissions: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!instance) {
      throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
    }

    await this.assertInstanceAccess(principal, instance);

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'FINAL');

    if (!validationRes.valid) {
      throw new ValidationError(
        `Submission finalization failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const committed = await executeCommand({
      principal,
      commandType: 'forms.submission.finalize',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
      const current = await tx.formInstance.findFirst({
        where: { id: instance.id, workspaceId: principal.workspaceId },
        include: { formVersion: true, submissions: { orderBy: { sequenceNumber: 'desc' }, take: 1 } },
      });
      if (!current) throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
      await this.assertInstanceAccess(principal, current, tx);
      await this.assertAnswerReferences(tx, principal, definition, validationRes.normalized, current);
      if (current.version !== input.expectedVersion || current.status === 'SUBMITTED') {
        throw new ConflictError(`Form instance '${input.instanceId}' changed or is already finalized`);
      }
      const claimed = await tx.formInstance.updateMany({
        where: { id: current.id, workspaceId: principal.workspaceId, version: input.expectedVersion, status: { in: ['PENDING', 'DRAFT'] } },
        data: { status: 'SUBMITTED', version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictError(`Form instance '${input.instanceId}' changed while finalizing`);

      let submissionId: string;

      const currentLatest = current.submissions[0];
      if (currentLatest?.status === 'DRAFT') {
        const finalized = await tx.formSubmission.update({
          where: { id: currentLatest.id },
          data: {
            status: 'FINAL',
            answersJson: JSON.stringify(validationRes.normalized),
            actorId: principal.userId,
            finalizedAt: new Date(),
            version: { increment: 1 },
          },
        });
        submissionId = finalized.id;
      } else {
        const nextSeq = currentLatest ? currentLatest.sequenceNumber + 1 : 1;
        const created = await tx.formSubmission.create({
          data: {
            workspace: { connect: { id: principal.workspaceId } },
            instance: { connect: { id: instance.id } },
            sequenceNumber: nextSeq,
            status: 'FINAL',
            answersJson: JSON.stringify(validationRes.normalized),
            actorId: principal.userId,
            finalizedAt: new Date(),
          },
        });
        submissionId = created.id;
      }

      // Record any document links if attachments exist
      for (const field of definition.fields) {
        if (field.kind === 'attachment') {
          const docIds = validationRes.normalized[field.key];
          if (Array.isArray(docIds)) {
            for (const docId of docIds) {
              if (typeof docId === 'string') {
                // Verify document belongs to workspace
                const doc = await tx.document.findFirst({
                  where: { id: docId, workspaceId: principal.workspaceId },
                });
                if (!doc) throw new BadRequestError(`Attachment '${docId}' is unavailable in this workspace`);
                await tx.formSubmissionDocument.create({
                  data: {
                    workspaceId: principal.workspaceId,
                    submissionId,
                    fieldKey: field.key,
                    documentId: doc.id,
                  },
                });
              }
            }
          }
        }
      }

      const data = { instanceId: current.id, submissionId, version: input.expectedVersion + 1 };
      return { data, aggregateType: 'FormInstance', aggregateId: current.id, previousVersion: input.expectedVersion, resourceVersion: data.version, auditDetails: { subjectType: current.subjectType, subjectId: current.subjectId, submissionId } };
      },
    });

    return committed.data;
  }

  async createCorrection(
    principal: Principal,
    input: CreateFormCorrectionInput,
    idempotencyKey: string = randomUUID()
  ): Promise<{ instanceId: string; submissionId: string; version: number }> {
    FormPolicy.requireCorrect(principal);

    if (!input.reason || input.reason.trim().length === 0) {
      throw new BadRequestError('Correction reason is mandatory');
    }

    const instance = await this.prisma.formInstance.findFirst({
      where: { id: input.instanceId, workspaceId: principal.workspaceId },
      include: {
        formVersion: true,
        submissions: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!instance) {
      throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
    }

    await this.assertInstanceAccess(principal, instance);

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'FINAL');

    if (!validationRes.valid) {
      throw new ValidationError(
        `Correction validation failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const committed = await executeCommand({
      principal,
      commandType: 'forms.submission.correct',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      reason: input.reason.trim(),
      prismaClient: this.prisma,
      handler: async (tx) => {
      const current = await tx.formInstance.findFirst({
        where: { id: instance.id, workspaceId: principal.workspaceId },
        include: { formVersion: true, submissions: { orderBy: { sequenceNumber: 'desc' }, take: 1 } },
      });
      if (!current) throw new NotFoundError(`Form instance '${input.instanceId}' not found`);
      await this.assertInstanceAccess(principal, current, tx);
      await this.assertAnswerReferences(tx, principal, definition, validationRes.normalized, current);
      const currentLatest = current.submissions[0];
      if (current.version !== input.expectedVersion || current.status !== 'SUBMITTED' || !currentLatest || currentLatest.status !== 'FINAL') {
        throw new ConflictError(`Form instance '${input.instanceId}' changed before correction`);
      }
      const claimed = await tx.formInstance.updateMany({
        where: { id: current.id, workspaceId: principal.workspaceId, version: input.expectedVersion, status: 'SUBMITTED' },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictError(`Form instance '${input.instanceId}' changed while correcting`);

      const nextSeq = currentLatest.sequenceNumber + 1;
      const corrected = await tx.formSubmission.create({
        data: {
          workspace: { connect: { id: principal.workspaceId } },
          instance: { connect: { id: instance.id } },
          sequenceNumber: nextSeq,
          status: 'FINAL',
          answersJson: JSON.stringify(validationRes.normalized),
          actorId: principal.userId,
          finalizedAt: new Date(),
          supersedes: { connect: { id: currentLatest.id } },
          correctionReason: input.reason.trim(),
        },
      });

      for (const field of definition.fields) {
        if (field.kind !== 'attachment') continue;
        const docIds = validationRes.normalized[field.key];
        if (!Array.isArray(docIds)) continue;
        for (const docId of docIds) {
          if (typeof docId !== 'string') continue;
          const doc = await tx.document.findFirst({ where: { id: docId, workspaceId: principal.workspaceId } });
          if (!doc) throw new BadRequestError(`Attachment '${docId}' is unavailable in this workspace`);
          await tx.formSubmissionDocument.create({ data: { workspaceId: principal.workspaceId, submissionId: corrected.id, fieldKey: field.key, documentId: doc.id } });
        }
      }

      const data = { instanceId: current.id, submissionId: corrected.id, version: input.expectedVersion + 1 };
      return { data, aggregateType: 'FormInstance', aggregateId: current.id, previousVersion: input.expectedVersion, resourceVersion: data.version, auditDetails: { subjectType: current.subjectType, subjectId: current.subjectId, submissionId: corrected.id, supersedesId: currentLatest.id } };
      },
    });

    return committed.data;
  }
}
