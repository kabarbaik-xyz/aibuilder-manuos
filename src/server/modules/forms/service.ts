import crypto from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { FormPolicy } from './policy';
import {
  CreateFormTemplateInput,
  CreateFormVersionInput,
  UpdateFormVersionDraftInput,
  FormVersionActionInput,
  BindFormVersionInput,
  CreateFormInstanceInput,
  FormTemplateDTO,
  FormVersionDTO,
} from './contracts';
import { validateDefinition } from '@/domain/forms/schema';
import { FormDefinition } from '@/domain/forms/types';
import { executeCommand } from '@/server/db/transaction';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  BadRequestError,
} from '@/domain/errors';

export function computeDefinitionHash(definition: FormDefinition): string {
  const normalized = JSON.stringify(definition);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export class FormService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTemplates(principal: Principal): Promise<FormTemplateDTO[]> {
    FormPolicy.requireRead(principal);
    const templates = await this.prisma.formTemplate.findMany({
      where: { workspaceId: principal.workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => {
      const published = t.versions.find((v) => v.status === 'PUBLISHED');
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        purpose: t.purpose,
        description: t.description,
        archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        versionsCount: t.versions.length,
        publishedVersion: published
          ? {
              id: published.id,
              versionNumber: published.versionNumber,
              contentHash: published.contentHash,
            }
          : undefined,
      };
    });
  }

  async getTemplate(principal: Principal, templateId: string): Promise<FormTemplateDTO & { versions: FormVersionDTO[] }> {
    FormPolicy.requireRead(principal);
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, workspaceId: principal.workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError(`Form template '${templateId}' not found`);
    }

    const versions: FormVersionDTO[] = template.versions.map((v) => ({
      id: v.id,
      templateId: v.templateId,
      versionNumber: v.versionNumber,
      status: v.status as any,
      schemaVersion: v.schemaVersion,
      definition: JSON.parse(v.definitionJson) as FormDefinition,
      contentHash: v.contentHash,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      publishedBy: v.publishedBy,
      version: v.version,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));

    const published = versions.find((v) => v.status === 'PUBLISHED');

    return {
      id: template.id,
      code: template.code,
      name: template.name,
      purpose: template.purpose,
      description: template.description,
      archivedAt: template.archivedAt ? template.archivedAt.toISOString() : null,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      versionsCount: versions.length,
      publishedVersion: published
        ? {
            id: published.id,
            versionNumber: published.versionNumber,
            contentHash: published.contentHash,
          }
        : undefined,
      versions,
    };
  }

  async createTemplate(
    principal: Principal,
    input: CreateFormTemplateInput
  ): Promise<{ templateId: string; versionId: string }> {
    FormPolicy.requireCreate(principal);

    const existing = await this.prisma.formTemplate.findUnique({
      where: {
        workspaceId_code: {
          workspaceId: principal.workspaceId,
          code: input.code.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Form template code '${input.code}' already exists in this workspace`);
    }

    const defaultDefinition: FormDefinition = {
      schemaVersion: 1,
      purpose: input.purpose,
      fields: [
        {
          key: 'notes',
          label: 'Inspection / Production Notes',
          kind: 'textarea',
          required: false,
          maxLength: 4000,
        },
      ],
    };

    const hash = computeDefinitionHash(defaultDefinition);

    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.formTemplate.create({
        data: {
          workspace: { connect: { id: principal.workspaceId } },
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          purpose: input.purpose,
          description: input.description?.trim(),
        },
      });

      const version = await tx.formVersion.create({
        data: {
          workspace: { connect: { id: principal.workspaceId } },
          template: { connect: { id: template.id } },
          versionNumber: 1,
          status: 'DRAFT',
          schemaVersion: 1,
          definitionJson: JSON.stringify(defaultDefinition),
          contentHash: hash,
        },
      });

      return { templateId: template.id, versionId: version.id };
    });

    return created;
  }

  async updateDraftVersion(
    principal: Principal,
    templateId: string,
    versionId: string,
    input: UpdateFormVersionDraftInput,
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<{ versionId: string; version: number }> {
    FormPolicy.requireEditDraft(principal);
    const validatedDef = validateDefinition(input.definition);
    const hash = computeDefinitionHash(validatedDef);
    const committed = await executeCommand({
      principal,
      commandType: 'forms.version.update_draft',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: { templateId, versionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.formVersion.findFirst({
          where: { id: versionId, templateId, workspaceId: principal.workspaceId },
        });
        if (!existing) throw new NotFoundError(`Form version '${versionId}' not found`);
        if (existing.status !== 'DRAFT') {
          throw new ConflictError(`Form version is in '${existing.status}' status and is immutable`);
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConflictError(`Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`);
        }

        const claimed = await tx.formVersion.updateMany({
          where: { id: versionId, templateId, workspaceId: principal.workspaceId, version: input.expectedVersion, status: 'DRAFT' },
          data: { definitionJson: JSON.stringify(validatedDef), contentHash: hash, version: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new ConflictError(`Form version '${versionId}' changed while updating`);
        const data = { versionId, version: existing.version + 1 };
        return {
          data,
          aggregateType: 'FormVersion',
          aggregateId: versionId,
          previousVersion: existing.version,
          resourceVersion: data.version,
          auditDetails: { templateId, status: 'DRAFT', hash },
        };
      },
    });
    return committed.data;
  }

  async submitReview(
    principal: Principal,
    templateId: string,
    versionId: string,
    input: FormVersionActionInput,
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<{ versionId: string; status: string }> {
    FormPolicy.requireSubmitReview(principal);
    const committed = await executeCommand({
      principal,
      commandType: 'forms.version.submit_review',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: { templateId, versionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.formVersion.findFirst({
          where: { id: versionId, templateId, workspaceId: principal.workspaceId },
        });
        if (!existing) throw new NotFoundError(`Form version '${versionId}' not found`);
        if (existing.status !== 'DRAFT') {
          throw new ConflictError(`Cannot submit review for form version with status '${existing.status}'`);
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConflictError(`Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`);
        }
        validateDefinition(JSON.parse(existing.definitionJson));
        const claimed = await tx.formVersion.updateMany({
          where: { id: versionId, templateId, workspaceId: principal.workspaceId, version: input.expectedVersion, status: 'DRAFT' },
          data: { status: 'REVIEW', version: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new ConflictError(`Form version '${versionId}' changed while submitting for review`);
        const data = { versionId, status: 'REVIEW' };
        return {
          data,
          aggregateType: 'FormVersion',
          aggregateId: versionId,
          previousVersion: existing.version,
          resourceVersion: existing.version + 1,
          auditDetails: { templateId, status: 'REVIEW' },
        };
      },
    });
    return committed.data;
  }

  async publishFormVersion(
    principal: Principal,
    input: { templateId: string; versionId: string; expectedVersion: number },
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<{ versionId: string; hash: string }> {
    FormPolicy.requirePublish(principal);
    const committed = await executeCommand({
      principal,
      commandType: 'forms.version.publish',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.formVersion.findFirst({
          where: { id: input.versionId, templateId: input.templateId, workspaceId: principal.workspaceId },
        });
        if (!existing) throw new NotFoundError(`Form version '${input.versionId}' not found`);
        if (existing.status !== 'DRAFT' && existing.status !== 'REVIEW') {
          throw new ConflictError(`Cannot publish form version with status '${existing.status}'`);
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConflictError(`Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`);
        }

        const validatedDef = validateDefinition(JSON.parse(existing.definitionJson));
        const hash = computeDefinitionHash(validatedDef);
        const claimed = await tx.formVersion.updateMany({
          where: {
            id: existing.id,
            templateId: input.templateId,
            workspaceId: principal.workspaceId,
            version: input.expectedVersion,
            status: { in: ['DRAFT', 'REVIEW'] },
          },
          data: {
            status: 'PUBLISHED',
            contentHash: hash,
            publishedAt: new Date(),
            publishedBy: principal.userId,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictError(`Form version '${input.versionId}' changed while publishing`);
        }

        const data = { versionId: existing.id, hash };
        return {
          data,
          aggregateType: 'FormVersion',
          aggregateId: existing.id,
          previousVersion: existing.version,
          resourceVersion: existing.version + 1,
          auditDetails: { templateId: input.templateId, status: 'PUBLISHED', hash },
        };
      },
    });

    return committed.data;
  }

  async retireFormVersion(
    principal: Principal,
    input: { templateId: string; versionId: string; expectedVersion: number },
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<{ versionId: string; status: string }> {
    FormPolicy.requireRetire(principal);
    const committed = await executeCommand({
      principal,
      commandType: 'forms.version.retire',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const existing = await tx.formVersion.findFirst({
          where: { id: input.versionId, templateId: input.templateId, workspaceId: principal.workspaceId },
        });
        if (!existing) throw new NotFoundError(`Form version '${input.versionId}' not found`);
        if (existing.status !== 'PUBLISHED') {
          throw new ConflictError(`Cannot retire version with status '${existing.status}'. Only PUBLISHED can be retired.`);
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConflictError(`Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`);
        }
        const claimed = await tx.formVersion.updateMany({
          where: { id: input.versionId, templateId: input.templateId, workspaceId: principal.workspaceId, version: input.expectedVersion, status: 'PUBLISHED' },
          data: { status: 'RETIRED', version: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new ConflictError(`Form version '${input.versionId}' changed while retiring`);
        const data = { versionId: existing.id, status: 'RETIRED' };
        return {
          data,
          aggregateType: 'FormVersion',
          aggregateId: existing.id,
          previousVersion: existing.version,
          resourceVersion: existing.version + 1,
          auditDetails: { templateId: input.templateId, status: 'RETIRED' },
        };
      },
    });
    return committed.data;
  }

  async forkVersion(
    principal: Principal,
    templateId: string,
    sourceVersionId: string
  ): Promise<{ versionId: string; versionNumber: number }> {
    FormPolicy.requireCreate(principal);

    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, workspaceId: principal.workspaceId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundError(`Form template '${templateId}' not found`);
    }

    const sourceVersion = template.versions.find((v) => v.id === sourceVersionId);
    if (!sourceVersion) {
      throw new NotFoundError(`Source version '${sourceVersionId}' not found`);
    }

    const nextVerNumber = template.versions[0] ? template.versions[0].versionNumber + 1 : 1;

    const forked = await this.prisma.formVersion.create({
      data: {
        workspace: { connect: { id: principal.workspaceId } },
        template: { connect: { id: templateId } },
        versionNumber: nextVerNumber,
        status: 'DRAFT',
        schemaVersion: sourceVersion.schemaVersion,
        definitionJson: sourceVersion.definitionJson,
        contentHash: sourceVersion.contentHash,
      },
    });

    return { versionId: forked.id, versionNumber: forked.versionNumber };
  }

  async bindFormVersion(
    principal: Principal,
    input: BindFormVersionInput,
    idempotencyKey: string = crypto.randomUUID()
  ) {
    FormPolicy.requireBind(principal);
    const committed = await executeCommand({
      principal,
      commandType: 'forms.binding.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const version = await tx.formVersion.findFirst({
          where: { id: input.formVersionId, workspaceId: principal.workspaceId },
          include: { template: { select: { purpose: true } } },
        });
        if (!version) throw new NotFoundError(`Form version '${input.formVersionId}' not found`);
        if (version.status !== 'PUBLISHED') {
          throw new BadRequestError(`Cannot bind form version in status '${version.status}'. Must be PUBLISHED.`);
        }

        const targets = {
          orderType: Boolean(input.orderTypeId),
          workflowNode: Boolean(input.workflowNodeKey || input.workflowVersionId),
          checklist: Boolean(input.qcChecklistId),
        };
        const validTarget = input.context === 'ORDER_TYPE'
          ? targets.orderType && !targets.workflowNode && !targets.checklist && Boolean(input.orderTypeId)
          : input.context === 'WORKFLOW_NODE'
            ? !targets.orderType && targets.workflowNode && Boolean(input.workflowNodeKey && input.workflowVersionId) && !targets.checklist
            : input.context === 'QC_CHECKLIST'
              ? !targets.orderType && !targets.workflowNode && targets.checklist
              : false;
        if (!validTarget) throw new BadRequestError('Provide exactly the target fields required by the selected form binding context.');

        const expectedPurpose = input.context === 'ORDER_TYPE' ? 'ORDER_SPEC'
          : input.context === 'QC_CHECKLIST' ? 'QC_EVIDENCE' : 'TASK_EVIDENCE';
        if (version.template.purpose !== expectedPurpose) {
          throw new BadRequestError(`${input.context} bindings require a ${expectedPurpose} form.`);
        }

        if (input.context === 'ORDER_TYPE') {
          const target = await tx.orderType.findFirst({ where: { id: input.orderTypeId, workspaceId: principal.workspaceId } });
          if (!target) throw new NotFoundError(`Order type '${input.orderTypeId}' not found`);
        } else if (input.context === 'WORKFLOW_NODE') {
          const workflow = await tx.workflowVersion.findFirst({
            where: { id: input.workflowVersionId, workspaceId: principal.workspaceId },
            include: { nodes: { select: { key: true } } },
          });
          if (!workflow) throw new NotFoundError('Workflow version not found');
          // Bindings are part of the workflow version's executable definition.
          // Allow authoring only while the version is a draft; publishing then
          // freezes the binding set for every order released from that version.
          if (workflow.status !== 'DRAFT') {
            throw new BadRequestError('Forms can only be bound to a draft workflow. Fork the workflow to change forms after publication.');
          }
          if (!workflow.nodes.some((node: { key: string }) => node.key === input.workflowNodeKey)) {
            throw new BadRequestError(`Workflow node '${input.workflowNodeKey}' does not exist in the selected version.`);
          }
        } else {
          const target = await tx.qcChecklist.findFirst({ where: { id: input.qcChecklistId, workspaceId: principal.workspaceId } });
          if (!target) throw new NotFoundError(`QC checklist '${input.qcChecklistId}' not found`);
        }

        const duplicate = await tx.formBinding.findFirst({
          where: {
            workspaceId: principal.workspaceId,
            formVersionId: input.formVersionId,
            context: input.context,
            orderTypeId: input.orderTypeId ?? null,
            workflowVersionId: input.workflowVersionId ?? null,
            workflowNodeKey: input.workflowNodeKey ?? null,
            qcChecklistId: input.qcChecklistId ?? null,
          },
        });
        if (duplicate) throw new ConflictError('This form version is already bound to the selected workflow stage.');

        const binding = await tx.formBinding.create({
          data: {
            workspaceId: principal.workspaceId,
            formVersionId: input.formVersionId,
            context: input.context,
            orderTypeId: input.orderTypeId ?? null,
            workflowNodeKey: input.workflowNodeKey ?? null,
            workflowVersionId: input.workflowVersionId ?? null,
            qcChecklistId: input.qcChecklistId ?? null,
            required: input.required ?? true,
          },
        });
        const data = { bindingId: binding.id };
        return { data, aggregateType: 'FormBinding', aggregateId: binding.id, resourceVersion: 1, auditDetails: { ...input } };
      },
    });
    return committed.data;
  }

  async createFormInstance(
    tx: Prisma.TransactionClient,
    input: CreateFormInstanceInput
  ): Promise<{ instanceId: string }> {
    // Check if instance already exists for this subject and version
    const existing = await tx.formInstance.findFirst({
      where: {
        workspaceId: input.workspaceId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        formVersionId: input.formVersionId,
      },
    });

    if (existing) {
      return { instanceId: existing.id };
    }

    const instance = await tx.formInstance.create({
      data: {
        workspace: { connect: { id: input.workspaceId } },
        formVersion: { connect: { id: input.formVersionId } },
        ...(input.formBindingId ? { formBinding: { connect: { id: input.formBindingId } } } : {}),
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        status: 'PENDING',
      },
    });

    return { instanceId: instance.id };
  }
}
