import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import {
  computeDefinitionHash,
  validateWorkflowDefinition,
  CatalogReferenceSet,
  WorkflowDefinition as DomainWorkflowDefinition,
} from '@/domain/workflow-definition';
import * as contracts from './contracts';
import { validateLifecycleDefinition, type OrderLifecycleDefinition } from '@/domain/order-lifecycle-definition';
import { getLifecycleActionDescriptor } from '@/server/modules/order-lifecycle/action-registry';
import { createHash } from 'crypto';

export class WorkflowService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  // -----------------------------------------------------------
  // Catalog loader
  // -----------------------------------------------------------
  async loadCatalog(workspaceId: string): Promise<CatalogReferenceSet> {
    const [departments, machineClasses, skills, certs, qcChecklists] = await Promise.all([
      this.prisma.department.findMany({
        where: { workspaceId, isActive: true, archivedAt: null },
        select: { id: true },
      }),
      this.prisma.machineClass.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true },
      }),
      this.prisma.skill.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true },
      }),
      this.prisma.certification.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true },
      }),
      this.prisma.qcChecklist.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true },
      }),
    ]);

    return {
      departmentIds: new Set(departments.map((d) => d.id)),
      machineClassIds: new Set(machineClasses.map((m) => m.id)),
      skillIds: new Set(skills.map((s) => s.id)),
      certIds: new Set(certs.map((c) => c.id)),
      qcChecklistIds: new Set(qcChecklists.map((q) => q.id)),
    };
  }

  // -----------------------------------------------------------
  // Templates
  // -----------------------------------------------------------
  async listTemplates(principal: Principal) {
    requirePermission(principal, 'workflow.read');
    return this.prisma.workflowTemplate.findMany({
      where: {
        workspaceId: principal.workspaceId,
        isArchived: false,
      },
      include: {
        orderType: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTemplate(principal: Principal, id: string) {
    requirePermission(principal, 'workflow.read');
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id, workspaceId: principal.workspaceId },
      include: {
        orderType: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            nodes: true,
            edges: true,
          },
        },
      },
    });
    if (!template) throw new NotFoundError(`Workflow template '${id}' not found`);
    return template;
  }

  async validateLifecycleReferences(
    tx: any,
    workspaceId: string,
    definition: OrderLifecycleDefinition
  ) {
    for (const stage of definition.stages) {
      const descriptor = getLifecycleActionDescriptor(stage.action);
      const requiredPermission = descriptor.requiredPermission;
      const department = await tx.department.findFirst({
        where: { id: stage.departmentId, workspaceId, isActive: true, archivedAt: null },
        select: { id: true },
      });
      if (!department) throw new BadRequestError(`Stage '${stage.key}' references an inactive or unavailable department.`);

      if (stage.assignment.kind === 'DEPARTMENT_QUEUE') {
        if (stage.assignment.departmentId !== stage.departmentId) {
          throw new BadRequestError(`Stage '${stage.key}' queue must match its owning department.`);
        }
        const roles = await tx.role.findMany({
          where: { workspaceId, code: { in: stage.assignment.eligibleRoleCodes }, isActive: true, permissions: { some: { permissionCode: requiredPermission } } },
          select: { code: true },
        });
        const available = new Set(roles.map((role: { code: string }) => role.code));
        const missing = stage.assignment.eligibleRoleCodes.filter((code) => !available.has(code));
        if (missing.length) throw new BadRequestError(`Stage '${stage.key}' references unavailable roles: ${missing.join(', ')}.`);
      } else {
        const membership = await tx.membership.findFirst({
          where: {
            id: stage.assignment.membershipId, workspaceId, status: 'ACTIVE',
            departmentId: stage.assignment.departmentId ?? stage.departmentId,
            roles: { some: { role: { isActive: true, permissions: { some: { permissionCode: requiredPermission } } } } },
          },
          select: { id: true },
        });
        if (!membership) throw new BadRequestError(`Stage '${stage.key}' member assignment must belong to its active department.`);
      }

      for (const form of stage.forms) {
        const version = await tx.formVersion.findFirst({
          where: { id: form.formVersionId, workspaceId, status: 'PUBLISHED', contentHash: form.contentHash },
          include: { template: { select: { purpose: true } } },
        });
        if (!version || !descriptor.formPurposes.includes(version.template.purpose)) {
          throw new BadRequestError(`Stage '${stage.key}' form pin is unpublished, changed, or incompatible with its action.`);
        }
      }

      if (stage.activationCondition) {
        const condition = stage.activationCondition;
        const sourceStage = definition.stages.find((candidate) => candidate.key === condition.sourceStageKey);
        if (condition.kind === 'QC_OUTCOME') {
          if (sourceStage?.action !== 'FINALIZE_QC') {
            throw new BadRequestError(`Stage '${stage.key}' QC outcome branch must reference a FINALIZE_QC predecessor.`);
          }
          continue;
        }
        const sourcePin = sourceStage?.forms.find((form) => form.formVersionId === condition.formVersionId);
        if (!sourcePin) throw new BadRequestError(`Stage '${stage.key}' branch condition must reference a form pinned to '${condition.sourceStageKey}'.`);
        const sourceVersion = await tx.formVersion.findFirst({
          where: { id: sourcePin.formVersionId, workspaceId, contentHash: sourcePin.contentHash },
          include: { template: { select: { purpose: true } } },
        });
        if (!sourceVersion || sourceVersion.template.purpose !== 'ORDER_SPEC') {
          throw new BadRequestError(`Stage '${stage.key}' branch conditions currently require a pinned order specification form.`);
        }
        const formDefinition = JSON.parse(sourceVersion.definitionJson) as { fields?: Array<{ key: string; kind: string; options?: Array<{ value: string }> }> };
        const field = formDefinition.fields?.find((candidate) => candidate.key === condition.fieldKey);
        if (!field || field.kind !== 'select') {
          throw new BadRequestError(`Stage '${stage.key}' branch field must be a select field in the pinned order specification form.`);
        }
        const allowedValues = new Set((field.options ?? []).map((option) => option.value));
        const selectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
        if (selectedValues.some((value) => !allowedValues.has(value))) {
          throw new BadRequestError(`Stage '${stage.key}' branch condition contains a value not offered by '${condition.fieldKey}'.`);
        }
      }
    }
  }

  private async validateStoredDefinition(tx: any, workspaceId: string, version: any): Promise<string> {
    const raw = JSON.parse(version.definitionJson) as unknown;
    if (version.template.kind === 'ORDER_LIFECYCLE') {
      const parsed = contracts.orderLifecycleDefinitionSchema.safeParse(raw);
      if (!parsed.success) throw new BadRequestError(`Lifecycle definition is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'definition'}: ${issue.message}`).join('; ')}`);
      const validation = validateLifecycleDefinition(parsed.data as OrderLifecycleDefinition);
      if (!validation.isValid) throw new BadRequestError(`Lifecycle definition is invalid: ${validation.errors.map((error) => `${error.stageKey ? `${error.stageKey}${error.fieldKey ? `.${error.fieldKey}` : ''}: ` : ''}${error.message}`).join('; ')}`);
      await this.validateLifecycleReferences(tx, workspaceId, parsed.data as OrderLifecycleDefinition);
      return createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
    }

    const definition = raw as DomainWorkflowDefinition;
    const catalog = await this.loadCatalog(workspaceId);
    const validation = validateWorkflowDefinition(definition, catalog);
    if (!validation.isValid) throw new BadRequestError(`Workflow definition is invalid: ${validation.errors.map((error) => error.message).join('; ')}`);
    const bindings = await tx.formBinding.findMany({
      where: { workspaceId, context: 'WORKFLOW_NODE', workflowVersionId: version.id },
      include: { formVersion: { select: { contentHash: true } } },
      orderBy: [{ workflowNodeKey: 'asc' }, { formVersionId: 'asc' }, { id: 'asc' }],
    });
    const executionBindings = bindings.map((binding: any) => ({
      workflowNodeKey: binding.workflowNodeKey,
      formVersionId: binding.formVersionId,
      contentHash: binding.formVersion.contentHash,
      required: binding.required,
      completionPoint: binding.completionPoint,
    }));
    return createHash('sha256').update(JSON.stringify({ definition, formBindings: executionBindings })).digest('hex');
  }

  async createTemplate(
    principal: Principal,
    input: contracts.CreateWorkflowTemplateInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'workflow.template.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const kind = input.kind ?? 'PRODUCTION_ROUTING';
        // Verify orderType
        const orderType = await tx.orderType.findFirst({
          where: { id: input.orderTypeId, workspaceId: principal.workspaceId },
        });
        if (!orderType) {
          throw new BadRequestError(`OrderType '${input.orderTypeId}' not found`);
        }

        const existing = await tx.workflowTemplate.findUnique({
          where: {
            workspaceId_code: {
              workspaceId: principal.workspaceId,
              code: input.code,
            },
          },
        });
        if (existing) {
          throw new ConflictError(`Workflow template with code '${input.code}' already exists`);
        }

        const template = await tx.workflowTemplate.create({
          data: {
            workspaceId: principal.workspaceId,
            orderTypeId: input.orderTypeId,
            kind,
            code: input.code,
            name: input.name,
            description: input.description,
          },
        });

        // Initialize draft version 1
        const initialDef = kind === 'ORDER_LIFECYCLE'
          ? { schemaVersion: 1 as const, name: `${input.name} Order Lifecycle`, stages: [] }
          : {
              schemaVersion: 1 as const,
              name: `${input.name} Initial Routing`,
              nodes: [{ key: 'OP-10', name: 'Initial Operation', type: 'OPERATION' as const, plannedDurationMinutes: 60 }],
              edges: [],
            };
        const defHash = createHash('sha256').update(JSON.stringify(initialDef)).digest('hex');

        const version = await tx.workflowVersion.create({
          data: {
            workspaceId: principal.workspaceId,
            templateId: template.id,
            versionNumber: 1,
            status: 'DRAFT',
            schemaVersion: 1,
            definitionJson: JSON.stringify(initialDef),
            definitionHash: defHash,
          },
        });

        if (kind === 'PRODUCTION_ROUTING') {
          await tx.workflowNode.create({
            data: {
              workspaceId: principal.workspaceId,
              versionId: version.id,
              key: 'OP-10',
              name: 'Initial Operation',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          });
        }

        return {
          data: { ...template, initialVersionId: version.id },
          aggregateType: 'WORKFLOW_TEMPLATE',
          aggregateId: template.id,
          resourceVersion: template.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Versions
  // -----------------------------------------------------------
  async getVersion(principal: Principal, versionId: string) {
    requirePermission(principal, 'workflow.read');
    const version = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workspaceId: principal.workspaceId },
      include: {
        template: { include: { orderType: true } },
        nodes: true,
        edges: true,
      },
    });
    if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);
    return version;
  }

  async saveVersionDraft(
    principal: Principal,
    versionId: string,
    input: contracts.SaveWorkflowVersionDraftInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'workflow.version.save_draft',
      idempotencyKey,
      payload: { versionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const version = await tx.workflowVersion.findFirst({
          where: { id: versionId, workspaceId: principal.workspaceId },
          include: { template: { select: { kind: true } } },
        });
        if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);

        if (version.status !== 'DRAFT') {
          throw new ConflictError(
            `Workflow version '${versionId}' has status '${version.status}' and cannot be edited. Fork a new version to modify.`
          );
        }

        if (input.expectedVersion && input.expectedVersion !== version.version) {
          throw new ConflictError('STALE_VERSION: Workflow version has been modified by another operation.');
        }

        // Validate DAG and catalog
        let definitionHash: string;
        if (version.template.kind === 'ORDER_LIFECYCLE') {
          const definition = input.definition as OrderLifecycleDefinition;
          const validation = validateLifecycleDefinition(definition);
          if (!validation.isValid) throw new BadRequestError(`Invalid lifecycle: ${validation.errors.map((error) => `${error.stageKey ? `${error.stageKey}${error.fieldKey ? `.${error.fieldKey}` : ''}: ` : ''}${error.message}`).join('; ')}`);
          await this.validateLifecycleReferences(tx, principal.workspaceId, definition);
          definitionHash = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
        } else {
          const catalog = await this.loadCatalog(principal.workspaceId);
          const valResult = validateWorkflowDefinition(input.definition as DomainWorkflowDefinition, catalog);
          if (!valResult.isValid) {
            const detail = valResult.errors.map((e) => e.message).join('; ');
            throw new BadRequestError(`Invalid workflow definition: ${detail}`);
          }
          definitionHash = computeDefinitionHash(input.definition as DomainWorkflowDefinition);
        }

        // Replace nodes and edges atomically
        await tx.workflowEdge.deleteMany({
          where: { workspaceId: principal.workspaceId, versionId },
        });
        await tx.workflowNode.deleteMany({
          where: { workspaceId: principal.workspaceId, versionId },
        });

        const routingDefinition = input.definition as DomainWorkflowDefinition;
        for (const node of version.template.kind === 'PRODUCTION_ROUTING' ? routingDefinition.nodes : []) {
          await tx.workflowNode.create({
            data: {
              workspaceId: principal.workspaceId,
              versionId,
              key: node.key,
              name: node.name,
              type: node.type,
              departmentId: node.departmentId,
              requiredPermission: node.requiredPermission,
              plannedDurationMinutes: node.plannedDurationMinutes,
              requirementsJson: JSON.stringify(node.requirements || {}),
              formGuardJson: JSON.stringify(node.formGuard || {}),
            },
          });
        }

        for (const edge of version.template.kind === 'PRODUCTION_ROUTING' ? routingDefinition.edges || [] : []) {
          await tx.workflowEdge.create({
            data: {
              workspaceId: principal.workspaceId,
              versionId,
              fromNodeKey: edge.fromNodeKey,
              toNodeKey: edge.toNodeKey,
              joinPolicy: edge.joinPolicy,
              conditionCode: edge.conditionCode,
              conditionParamsJson: JSON.stringify(edge.conditionParams || {}),
            },
          });
        }

        const updated = await tx.workflowVersion.update({
          where: { id: versionId },
          data: {
            definitionJson: JSON.stringify(input.definition),
            definitionHash,
            version: { increment: 1 },
          },
          include: {
            nodes: true,
            edges: true,
          },
        });

        return {
          data: updated,
          aggregateType: 'WORKFLOW_VERSION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async submitReview(principal: Principal, versionId: string, idempotencyKey: string) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'workflow.version.submit_review',
      idempotencyKey,
      payload: { versionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const version = await tx.workflowVersion.findFirst({
          where: { id: versionId, workspaceId: principal.workspaceId },
          include: { template: { select: { kind: true } } },
        });
        if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);

        if (version.status !== 'DRAFT') {
          throw new ConflictError(
            `Cannot submit review for version in status '${version.status}'. Must be in 'DRAFT'.`
          );
        }

        await this.validateStoredDefinition(tx, principal.workspaceId, version);

        const updated = await tx.workflowVersion.update({
          where: { id: versionId },
          data: {
            status: 'REVIEW',
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'WORKFLOW_VERSION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async publishVersion(principal: Principal, versionId: string, idempotencyKey: string) {
    requirePermission(principal, 'workflow.publish');

    return executeCommand({
      principal,
      commandType: 'workflow.version.publish',
      idempotencyKey,
      payload: { versionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const version = await tx.workflowVersion.findFirst({
          where: { id: versionId, workspaceId: principal.workspaceId },
          include: { template: { select: { kind: true } } },
        });
        if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);

        if (version.status === 'PUBLISHED') {
          return {
            data: version,
            aggregateType: 'WORKFLOW_VERSION',
            aggregateId: version.id,
            resourceVersion: version.version,
          };
        }

        if (version.status !== 'DRAFT' && version.status !== 'REVIEW') {
          throw new ConflictError(
            `Cannot publish workflow version in status '${version.status}'. Must be DRAFT or REVIEW.`
          );
        }

        const definitionHash = await this.validateStoredDefinition(tx, principal.workspaceId, version);

        const updated = await tx.workflowVersion.update({
          where: { id: versionId },
          data: {
            status: 'PUBLISHED',
            definitionHash,
            publishedById: principal.userId,
            publishedAt: new Date(),
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'WORKFLOW_VERSION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async retireVersion(principal: Principal, versionId: string, idempotencyKey: string) {
    requirePermission(principal, 'workflow.publish');

    return executeCommand({
      principal,
      commandType: 'workflow.version.retire',
      idempotencyKey,
      payload: { versionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const version = await tx.workflowVersion.findFirst({
          where: { id: versionId, workspaceId: principal.workspaceId },
        });
        if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);

        if (version.status !== 'PUBLISHED') {
          throw new ConflictError(
            `Cannot retire version in status '${version.status}'. Only PUBLISHED versions can be retired.`
          );
        }

        const updated = await tx.workflowVersion.update({
          where: { id: versionId },
          data: {
            status: 'RETIRED',
            version: { increment: 1 },
          },
        });

        return {
          data: updated,
          aggregateType: 'WORKFLOW_VERSION',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  async forkVersion(principal: Principal, versionId: string, idempotencyKey: string) {
    requirePermission(principal, 'workflow.author');

    return executeCommand({
      principal,
      commandType: 'workflow.version.fork',
      idempotencyKey,
      payload: { versionId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const sourceVersion = await tx.workflowVersion.findFirst({
          where: { id: versionId, workspaceId: principal.workspaceId },
          include: { nodes: true, edges: true },
        });
        if (!sourceVersion) throw new NotFoundError(`Workflow version '${versionId}' not found`);
        const sourceFormBindings = await tx.formBinding.findMany({
          where: { workspaceId: principal.workspaceId, context: 'WORKFLOW_NODE', workflowVersionId: sourceVersion.id },
          orderBy: [{ workflowNodeKey: 'asc' }, { formVersionId: 'asc' }, { id: 'asc' }],
        });

        // Find highest version number for this template
        const latest = await tx.workflowVersion.findFirst({
          where: { templateId: sourceVersion.templateId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const nextVersionNumber = (latest?.versionNumber || 1) + 1;

        const newVersion = await tx.workflowVersion.create({
          data: {
            workspaceId: principal.workspaceId,
            templateId: sourceVersion.templateId,
            versionNumber: nextVersionNumber,
            status: 'DRAFT',
            schemaVersion: sourceVersion.schemaVersion,
            definitionJson: sourceVersion.definitionJson,
            definitionHash: sourceVersion.definitionHash,
          },
        });

        // Duplicate nodes and edges
        for (const node of sourceVersion.nodes) {
          await tx.workflowNode.create({
            data: {
              workspaceId: principal.workspaceId,
              versionId: newVersion.id,
              key: node.key,
              name: node.name,
              type: node.type,
              departmentId: node.departmentId,
              requiredPermission: node.requiredPermission,
              plannedDurationMinutes: node.plannedDurationMinutes,
              requirementsJson: node.requirementsJson,
              formGuardJson: node.formGuardJson,
            },
          });
        }

        for (const edge of sourceVersion.edges) {
          await tx.workflowEdge.create({
            data: {
              workspaceId: principal.workspaceId,
              versionId: newVersion.id,
              fromNodeKey: edge.fromNodeKey,
              toNodeKey: edge.toNodeKey,
              joinPolicy: edge.joinPolicy,
              conditionCode: edge.conditionCode,
              conditionParamsJson: edge.conditionParamsJson,
            },
          });
        }

        for (const binding of sourceFormBindings) {
          await tx.formBinding.create({
            data: {
              workspaceId: principal.workspaceId,
              formVersionId: binding.formVersionId,
              context: 'WORKFLOW_NODE',
              workflowNodeKey: binding.workflowNodeKey,
              workflowVersionId: newVersion.id,
              required: binding.required,
              completionPoint: binding.completionPoint,
            },
          });
        }

        const result = await tx.workflowVersion.findUnique({
          where: { id: newVersion.id },
          include: { nodes: true, edges: true },
        });

        return {
          data: result!,
          aggregateType: 'WORKFLOW_VERSION',
          aggregateId: newVersion.id,
          resourceVersion: newVersion.version,
        };
      },
    });
  }
}

export const workflowService = new WorkflowService();
