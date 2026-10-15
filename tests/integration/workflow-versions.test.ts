import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess, TestAccessResult } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { ForbiddenError, ConflictError, BadRequestError } from '@/domain/errors';

describe('W01: Typed Workflow Definitions and Published Versions', () => {
  let testDb: TestDatabase;
  let mastersService: MastersService;
  let workflowService: WorkflowService;

  let ownerEngineer: TestAccessResult;
  let engineerOnly: TestAccessResult;
  let salesOnly: TestAccessResult;

  let orderTypeId: string;
  let deptMachiningId: string;
  let deptAssemblyId: string;
  let qcChecklistId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    mastersService = new MastersService(testDb.db);
    workflowService = new WorkflowService(testDb.db);

    ownerEngineer = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-WF-TEST',
      email: 'owner-eng@test.test',
      roles: ['OWNER', 'ENGINEER'],
    });

    engineerOnly = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-WF-TEST',
      email: 'engineer@test.test',
      roles: ['ENGINEER'],
    });

    salesOnly = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-WF-TEST',
      email: 'sales@test.test',
      roles: ['SALES'],
    });

    // Create required masters: OrderType, Departments, QC Checklist
    const otRes = await mastersService.createOrderType(
      ownerEngineer.principal,
      { code: 'OT-MACHINING', name: 'Precision Machining' },
      'cmd-ot-1'
    );
    orderTypeId = otRes.data.id;

    const dept1 = await mastersService.createDepartment(
      ownerEngineer.principal,
      { code: 'DEPT-CNC', name: 'CNC Milling Dept' },
      'cmd-dept-1'
    );
    deptMachiningId = dept1.data.id;

    const dept2 = await mastersService.createDepartment(
      ownerEngineer.principal,
      { code: 'DEPT-ASSY', name: 'Manual Assembly' },
      'cmd-dept-2'
    );
    deptAssemblyId = dept2.data.id;

    const qcRes = await mastersService.createQcChecklist(
      ownerEngineer.principal,
      {
        code: 'QC-INSPECT-01',
        name: 'First Article Inspection',
        checks: [
          {
            code: 'CHK-DIM',
            description: 'Check bore diameter',
            method: 'MEASUREMENT',
            isRequired: true,
          },
        ],
      },
      'cmd-qc-1'
    );
    qcChecklistId = qcRes.data.id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('creates a workflow template with initialized draft version', async () => {
    const res = await workflowService.createTemplate(
      ownerEngineer.principal,
      {
        orderTypeId,
        code: 'WF-BRACKET-01',
        name: 'Mounting Bracket Routing',
        description: 'CNC Mill -> Deburr -> Final Inspection',
      },
      'cmd-wf-template-1'
    );

    expect(res.data.code).toBe('WF-BRACKET-01');
    expect(res.data.initialVersionId).toBeDefined();

    const template = await workflowService.getTemplate(ownerEngineer.principal, res.data.id);
    expect(template.versions.length).toBe(1);
    expect(template.versions[0].status).toBe('DRAFT');
    expect(template.versions[0].versionNumber).toBe(1);
  });

  it('saves and updates draft workflow definition with nodes and edges', async () => {
    const template = await testDb.db.workflowTemplate.findFirst({
      where: { code: 'WF-BRACKET-01' },
      include: { versions: true },
    });
    const versionId = template!.versions[0].id;

    const validDefinition = {
      schemaVersion: 1,
      name: 'Mounting Bracket 3-step routing',
      nodes: [
        {
          key: 'OP-10',
          name: 'CNC Milling',
          type: 'OPERATION' as const,
          departmentId: deptMachiningId,
          plannedDurationMinutes: 120,
        },
        {
          key: 'OP-20',
          name: 'Deburr & Wash',
          type: 'OPERATION' as const,
          departmentId: deptAssemblyId,
          plannedDurationMinutes: 30,
        },
        {
          key: 'QC-30',
          name: 'Final Quality Gate',
          type: 'INSPECTION' as const,
          plannedDurationMinutes: 45,
          formGuard: {
            qcChecklistId,
            requireSignOff: true,
          },
        },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
      ],
    };

    const updateRes = await workflowService.saveVersionDraft(
      ownerEngineer.principal,
      versionId,
      { definition: validDefinition },
      'cmd-save-draft-1'
    );

    expect(updateRes.data.definitionHash).toBeDefined();

    // Verify DB persistence
    const dbNodes = await testDb.db.workflowNode.findMany({
      where: { versionId },
      orderBy: { key: 'asc' },
    });
    expect(dbNodes.length).toBe(3);
    expect(dbNodes.map((n) => n.key)).toEqual(['OP-10', 'OP-20', 'QC-30']);

    const dbEdges = await testDb.db.workflowEdge.findMany({
      where: { versionId },
      orderBy: { fromNodeKey: 'asc' },
    });
    expect(dbEdges.length).toBe(2);
    expect(dbEdges[0].fromNodeKey).toBe('OP-10');
    expect(dbEdges[0].toNodeKey).toBe('OP-20');
  });

  it('rejects cyclical dependencies and invalid catalog references', async () => {
    const template = await testDb.db.workflowTemplate.findFirst({
      where: { code: 'WF-BRACKET-01' },
      include: { versions: true },
    });
    const versionId = template!.versions[0].id;

    // 1. Cyclic definition
    const cyclicDef = {
      schemaVersion: 1,
      name: 'Cyclic Routing',
      nodes: [
        { key: 'A', name: 'Step A', type: 'OPERATION' as const, plannedDurationMinutes: 10 },
        { key: 'B', name: 'Step B', type: 'OPERATION' as const, plannedDurationMinutes: 10 },
      ],
      edges: [
        { fromNodeKey: 'A', toNodeKey: 'B', joinPolicy: 'AND' as const },
        { fromNodeKey: 'B', toNodeKey: 'A', joinPolicy: 'AND' as const },
      ],
    };

    await expect(
      workflowService.saveVersionDraft(
        ownerEngineer.principal,
        versionId,
        { definition: cyclicDef },
        'cmd-cyclic-test'
      )
    ).rejects.toThrow(BadRequestError);

    // 2. Unknown catalog department
    const badCatalogDef = {
      schemaVersion: 1,
      name: 'Bad Catalog Routing',
      nodes: [
        {
          key: 'OP-10',
          name: 'Op with ghost department',
          type: 'OPERATION' as const,
          departmentId: 'dept-non-existent-999',
          plannedDurationMinutes: 30,
        },
      ],
      edges: [],
    };

    await expect(
      workflowService.saveVersionDraft(
        ownerEngineer.principal,
        versionId,
        { definition: badCatalogDef },
        'cmd-bad-catalog-test'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('enforces RBAC: only OWNER can publish, unauthorized role is rejected', async () => {
    const template = await testDb.db.workflowTemplate.findFirst({
      where: { code: 'WF-BRACKET-01' },
      include: { versions: true },
    });
    const versionId = template!.versions[0].id;

    // Engineer can submit review
    await workflowService.submitReview(engineerOnly.principal, versionId, 'cmd-review-1');

    const inReview = await workflowService.getVersion(ownerEngineer.principal, versionId);
    expect(inReview.status).toBe('REVIEW');

    // Engineer alone (without OWNER) cannot publish
    await expect(
      workflowService.publishVersion(engineerOnly.principal, versionId, 'cmd-pub-denied')
    ).rejects.toThrow(ForbiddenError);

    // Sales cannot publish or author
    await expect(
      workflowService.publishVersion(salesOnly.principal, versionId, 'cmd-pub-sales-denied')
    ).rejects.toThrow(ForbiddenError);

    // OWNER publishes successfully
    const pubRes = await workflowService.publishVersion(
      ownerEngineer.principal,
      versionId,
      'cmd-pub-success'
    );
    expect(pubRes.data.status).toBe('PUBLISHED');
    expect(pubRes.data.publishedById).toBe(ownerEngineer.principal.userId);
    expect(pubRes.data.publishedAt).toBeDefined();
  });

  it('guarantees immutability of published versions and allows forking', async () => {
    const template = await testDb.db.workflowTemplate.findFirst({
      where: { code: 'WF-BRACKET-01' },
      include: { versions: true },
    });
    const versionId = template!.versions[0].id;

    // Trying to save changes to a PUBLISHED version throws ConflictError
    await expect(
      workflowService.saveVersionDraft(
        ownerEngineer.principal,
        versionId,
        {
          definition: {
            schemaVersion: 1,
            nodes: [{ key: 'MOD-1', name: 'Modified Op', type: 'OPERATION', plannedDurationMinutes: 10 }],
            edges: [],
          },
        },
        'cmd-modify-published'
      )
    ).rejects.toThrow(ConflictError);

    // Forking creates version 2 in DRAFT
    const forkRes = await workflowService.forkVersion(
      engineerOnly.principal,
      versionId,
      'cmd-fork-v2'
    );

    expect(forkRes.data.versionNumber).toBe(2);
    expect(forkRes.data.status).toBe('DRAFT');
    expect(forkRes.data.nodes.length).toBe(3);
    expect(forkRes.data.edges.length).toBe(2);

    // Forked version can be edited freely
    const forkedDef = {
      schemaVersion: 1,
      nodes: [
        { key: 'OP-NEW', name: 'New Precision Pass', type: 'OPERATION' as const, plannedDurationMinutes: 50 },
      ],
      edges: [],
    };

    const updateForkRes = await workflowService.saveVersionDraft(
      engineerOnly.principal,
      forkRes.data.id,
      { definition: forkedDef },
      'cmd-update-fork'
    );
    expect(updateForkRes.data.nodes.length).toBe(1);
    expect(updateForkRes.data.nodes[0].key).toBe('OP-NEW');

    // Original published version 1 remains untouched
    const v1 = await workflowService.getVersion(ownerEngineer.principal, versionId);
    expect(v1.status).toBe('PUBLISHED');
    expect(v1.nodes.length).toBe(3);
  });

  it('creates and validates a second distinct workflow definition with parallel paths', async () => {
    const res = await workflowService.createTemplate(
      ownerEngineer.principal,
      {
        orderTypeId,
        code: 'WF-PANEL-PARALLEL',
        name: 'Control Panel Dual-Track Assembly',
      },
      'cmd-wf-template-2'
    );

    const versionId = res.data.initialVersionId;

    // Parallel branches: OP-A & OP-B run in parallel, join at OP-JOIN, then QC-GATE
    const parallelDef = {
      schemaVersion: 1,
      name: 'Dual-Track Assembly',
      nodes: [
        { key: 'OP-A', name: 'Wiring Sub-assembly', type: 'OPERATION' as const, plannedDurationMinutes: 60 },
        { key: 'OP-B', name: 'Chassis Pre-drilling', type: 'OPERATION' as const, plannedDurationMinutes: 45 },
        { key: 'OP-JOIN', name: 'Final Integration', type: 'OPERATION' as const, plannedDurationMinutes: 90 },
        { key: 'QC-GATE', name: 'Hi-Pot & Function Test', type: 'INSPECTION' as const, plannedDurationMinutes: 30 },
      ],
      edges: [
        { fromNodeKey: 'OP-A', toNodeKey: 'OP-JOIN', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-B', toNodeKey: 'OP-JOIN', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-JOIN', toNodeKey: 'QC-GATE', joinPolicy: 'AND' as const },
      ],
    };

    const saveRes = await workflowService.saveVersionDraft(
      ownerEngineer.principal,
      versionId,
      { definition: parallelDef },
      'cmd-save-parallel'
    );
    expect(saveRes.data.nodes.length).toBe(4);
    expect(saveRes.data.edges.length).toBe(3);

    // Publish parallel workflow
    const pubRes = await workflowService.publishVersion(
      ownerEngineer.principal,
      versionId,
      'cmd-pub-parallel'
    );
    expect(pubRes.data.status).toBe('PUBLISHED');
  });
});
