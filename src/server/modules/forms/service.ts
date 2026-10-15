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
    input: UpdateFormVersionDraftInput
  ): Promise<{ versionId: string; version: number }> {
    FormPolicy.requireEditDraft(principal);

    const existing = await this.prisma.formVersion.findFirst({
      where: { id: versionId, templateId, workspaceId: principal.workspaceId },
    });

    if (!existing) {
      throw new NotFoundError(`Form version '${versionId}' not found`);
    }

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(`Form version is in '${existing.status}' status and is immutable`);
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`
      );
    }

    const validatedDef = validateDefinition(input.definition);
    const hash = computeDefinitionHash(validatedDef);

    const updated = await this.prisma.formVersion.update({
      where: { id: versionId },
      data: {
        definitionJson: JSON.stringify(validatedDef),
        contentHash: hash,
        version: { increment: 1 },
      },
    });

    return { versionId: updated.id, version: updated.version };
  }

  async submitReview(
    principal: Principal,
    templateId: string,
    versionId: string,
    input: FormVersionActionInput
  ): Promise<{ versionId: string; status: string }> {
    FormPolicy.requireSubmitReview(principal);

    const existing = await this.prisma.formVersion.findFirst({
      where: { id: versionId, templateId, workspaceId: principal.workspaceId },
    });

    if (!existing) {
      throw new NotFoundError(`Form version '${versionId}' not found`);
    }

    if (existing.status !== 'DRAFT') {
      throw new ConflictError(`Cannot submit review for form version with status '${existing.status}'`);
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`
      );
    }

    // Validate definition before review
    const def = JSON.parse(existing.definitionJson);
    validateDefinition(def);

    const updated = await this.prisma.formVersion.update({
      where: { id: versionId },
      data: {
        status: 'REVIEW',
        version: { increment: 1 },
      },
    });

    return { versionId: updated.id, status: updated.status };
  }

  async publishFormVersion(
    principal: Principal,
    input: { templateId: string; versionId: string; expectedVersion: number }
  ): Promise<{ versionId: string; hash: string }> {
    FormPolicy.requirePublish(principal);

    const existing = await this.prisma.formVersion.findFirst({
      where: { id: input.versionId, templateId: input.templateId, workspaceId: principal.workspaceId },
    });

    if (!existing) {
      throw new NotFoundError(`Form version '${input.versionId}' not found`);
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REVIEW') {
      throw new ConflictError(`Cannot publish form version with status '${existing.status}'`);
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`
      );
    }

    const def = JSON.parse(existing.definitionJson);
    const validatedDef = validateDefinition(def);
    const hash = computeDefinitionHash(validatedDef);

    const published = await this.prisma.formVersion.update({
      where: { id: input.versionId },
      data: {
        status: 'PUBLISHED',
        contentHash: hash,
        publishedAt: new Date(),
        publishedBy: principal.userId,
        version: { increment: 1 },
      },
    });

    return { versionId: published.id, hash: published.contentHash };
  }

  async retireFormVersion(
    principal: Principal,
    input: { templateId: string; versionId: string; expectedVersion: number }
  ): Promise<{ versionId: string; status: string }> {
    FormPolicy.requireRetire(principal);

    const existing = await this.prisma.formVersion.findFirst({
      where: { id: input.versionId, templateId: input.templateId, workspaceId: principal.workspaceId },
    });

    if (!existing) {
      throw new NotFoundError(`Form version '${input.versionId}' not found`);
    }

    if (existing.status !== 'PUBLISHED') {
      throw new ConflictError(`Cannot retire version with status '${existing.status}'. Only PUBLISHED can be retired.`);
    }

    if (existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected version ${input.expectedVersion}, but found ${existing.version}`
      );
    }

    const retired = await this.prisma.formVersion.update({
      where: { id: input.versionId },
      data: {
        status: 'RETIRED',
        version: { increment: 1 },
      },
    });

    return { versionId: retired.id, status: retired.status };
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
    input: BindFormVersionInput
  ): Promise<{ bindingId: string }> {
    FormPolicy.requireBind(principal);

    const version = await this.prisma.formVersion.findFirst({
      where: { id: input.formVersionId, workspaceId: principal.workspaceId },
    });

    if (!version) {
      throw new NotFoundError(`Form version '${input.formVersionId}' not found`);
    }

    if (version.status !== 'PUBLISHED') {
      throw new BadRequestError(`Cannot bind form version in status '${version.status}'. Must be PUBLISHED.`);
    }

    const binding = await this.prisma.formBinding.create({
      data: {
        workspace: { connect: { id: principal.workspaceId } },
        formVersion: { connect: { id: input.formVersionId } },
        context: input.context,
        orderTypeId: input.orderTypeId,
        workflowNodeKey: input.workflowNodeKey,
        workflowVersionId: input.workflowVersionId,
        qcChecklistId: input.qcChecklistId,
        required: input.required ?? true,
      },
    });

    return { bindingId: binding.id };
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
