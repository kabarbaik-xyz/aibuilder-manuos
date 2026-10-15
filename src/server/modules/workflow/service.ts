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
            code: input.code,
            name: input.name,
            description: input.description,
          },
        });

        // Initialize draft version 1
        const initialDef: DomainWorkflowDefinition = {
          schemaVersion: 1,
          name: `${input.name} Initial Routing`,
          nodes: [
            {
              key: 'OP-10',
              name: 'Initial Operation',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        };
        const defHash = computeDefinitionHash(initialDef);

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
        const catalog = await this.loadCatalog(principal.workspaceId);
        const valResult = validateWorkflowDefinition(input.definition as DomainWorkflowDefinition, catalog);
        if (!valResult.isValid) {
          const detail = valResult.errors.map((e) => e.message).join('; ');
          throw new BadRequestError(`Invalid workflow definition: ${detail}`);
        }

        const definitionHash = computeDefinitionHash(input.definition as DomainWorkflowDefinition);

        // Replace nodes and edges atomically
        await tx.workflowEdge.deleteMany({
          where: { workspaceId: principal.workspaceId, versionId },
        });
        await tx.workflowNode.deleteMany({
          where: { workspaceId: principal.workspaceId, versionId },
        });

        for (const node of input.definition.nodes) {
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

        for (const edge of input.definition.edges || []) {
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
        });
        if (!version) throw new NotFoundError(`Workflow version '${versionId}' not found`);

        if (version.status !== 'DRAFT') {
          throw new ConflictError(
            `Cannot submit review for version in status '${version.status}'. Must be in 'DRAFT'.`
          );
        }

        const definition: DomainWorkflowDefinition = JSON.parse(version.definitionJson);
        const catalog = await this.loadCatalog(principal.workspaceId);
        const valResult = validateWorkflowDefinition(definition, catalog);
        if (!valResult.isValid) {
          throw new BadRequestError(
            `Workflow definition cannot be submitted for review: ${valResult.errors.map((e) => e.message).join('; ')}`
          );
        }

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

        const definition: DomainWorkflowDefinition = JSON.parse(version.definitionJson);
        const catalog = await this.loadCatalog(principal.workspaceId);
        const valResult = validateWorkflowDefinition(definition, catalog);
        if (!valResult.isValid) {
          throw new BadRequestError(
            `Workflow definition is invalid and cannot be published: ${valResult.errors.map((e) => e.message).join('; ')}`
          );
        }

        const definitionHash = computeDefinitionHash(definition);

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
