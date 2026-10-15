import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
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

  private async assertInstanceAccess(principal: Principal, instance: any): Promise<void> {
    // 1. Check workspace matching
    if (instance.workspaceId !== principal.workspaceId) {
      throw new NotFoundError(`Form instance '${instance.id}' not found`);
    }

    // 2. Deny customer users from internal form submissions
    if (principal.roles.includes('CUSTOMER') && !principal.roles.includes('OWNER')) {
      throw new ForbiddenError('Customer users are not permitted to submit internal forms');
    }

    // 3. Subject-specific checks
    if (instance.subjectType === 'TASK') {
      const isOwnerOrAdmin = principal.roles.includes('OWNER') || principal.roles.includes('ACCESS_ADMIN');
      const isTechOrQC =
        principal.permissions.has('task.execute_assigned') ||
        principal.permissions.has('task.read_assigned') ||
        principal.permissions.has('execution.assign') ||
        principal.permissions.has('execution.read') ||
        principal.roles.includes('OPERATOR');
      if (!isOwnerOrAdmin && !isTechOrQC) {
        throw new ForbiddenError('Permission denied for task evidence form instance');
      }
    } else if (instance.subjectType === 'ORDER') {
      const canReadOrder = principal.permissions.has('order.read') || principal.roles.includes('OWNER');
      if (!canReadOrder) {
        throw new ForbiddenError('Permission denied for order specification form instance');
      }
    } else if (instance.subjectType === 'INSPECTION') {
      const canInspect = principal.permissions.has('quality.inspect') || principal.roles.includes('OWNER');
      if (!canInspect) {
        throw new ForbiddenError('Permission denied for quality inspection form instance');
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
    input: SaveFormDraftInput
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

    if (instance.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${instance.version}`
      );
    }

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'DRAFT');

    // In DRAFT mode, unknown keys or invalid types produce validation error
    if (!validationRes.valid) {
      throw new ValidationError(
        `Draft validation failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const latest = instance.submissions[0];
    const isLatestDraft = latest && latest.status === 'DRAFT';

    const result = await this.prisma.$transaction(async (tx) => {
      let submissionId: string;

      if (isLatestDraft) {
        const updated = await tx.formSubmission.update({
          where: { id: latest.id },
          data: {
            answersJson: JSON.stringify(validationRes.normalized),
            actorId: principal.userId,
            version: { increment: 1 },
          },
        });
        submissionId = updated.id;
      } else {
        const nextSeq = latest ? latest.sequenceNumber + 1 : 1;
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

      const updatedInstance = await tx.formInstance.update({
        where: { id: instance.id },
        data: {
          status: 'DRAFT',
          version: { increment: 1 },
        },
      });

      return {
        instanceId: updatedInstance.id,
        submissionId,
        version: updatedInstance.version,
      };
    });

    return result;
  }

  async finalizeSubmission(
    principal: Principal,
    input: FinalizeFormSubmissionInput
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

    if (instance.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${instance.version}`
      );
    }

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'FINAL');

    if (!validationRes.valid) {
      throw new ValidationError(
        `Submission finalization failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const latest = instance.submissions[0];
    const isLatestDraft = latest && latest.status === 'DRAFT';

    const result = await this.prisma.$transaction(async (tx) => {
      let submissionId: string;

      if (isLatestDraft) {
        const finalized = await tx.formSubmission.update({
          where: { id: latest.id },
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
        const nextSeq = latest ? latest.sequenceNumber + 1 : 1;
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
                if (doc) {
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
      }

      const updatedInstance = await tx.formInstance.update({
        where: { id: instance.id },
        data: {
          status: 'SUBMITTED',
          version: { increment: 1 },
        },
      });

      return {
        instanceId: updatedInstance.id,
        submissionId,
        version: updatedInstance.version,
      };
    });

    return result;
  }

  async createCorrection(
    principal: Principal,
    input: CreateFormCorrectionInput
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

    if (instance.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${instance.version}`
      );
    }

    const latest = instance.submissions[0];
    if (!latest || latest.status !== 'FINAL') {
      throw new BadRequestError('Cannot create a correction for an unfinalized submission');
    }

    const definition = JSON.parse(instance.formVersion.definitionJson) as FormDefinition;
    const validationRes = validateAnswers(definition, input.answers, 'FINAL');

    if (!validationRes.valid) {
      throw new ValidationError(
        `Correction validation failed: ${validationRes.issues.map((i) => i.message).join('; ')}`
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const nextSeq = latest.sequenceNumber + 1;
      const corrected = await tx.formSubmission.create({
        data: {
          workspace: { connect: { id: principal.workspaceId } },
          instance: { connect: { id: instance.id } },
          sequenceNumber: nextSeq,
          status: 'FINAL',
          answersJson: JSON.stringify(validationRes.normalized),
          actorId: principal.userId,
          finalizedAt: new Date(),
          supersedes: { connect: { id: latest.id } },
          correctionReason: input.reason.trim(),
        },
      });

      const updatedInstance = await tx.formInstance.update({
        where: { id: instance.id },
        data: {
          status: 'SUBMITTED',
          version: { increment: 1 },
        },
      });

      return {
        instanceId: updatedInstance.id,
        submissionId: corrected.id,
        version: updatedInstance.version,
      };
    });

    return result;
  }
}
