import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess, TestAccessResult } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { ForbiddenError, BadRequestError } from '@/domain/errors';

describe('W03: Release and Process Instantiation Transaction', () => {
  let testDb: TestDatabase;
  let mastersService: MastersService;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;

  let owner: TestAccessResult;
  let engineer: TestAccessResult;
  let sales: TestAccessResult;

  let uomPcsId: string;
  let uomKgId: string;
  let customerId: string;
  let orderTypeId: string;
  let rawItemId: string;
  let fgItemId: string;

  let workflowTemplateId: string;
  let wfV1Id: string;
  let wfV2Id: string;

  let orderAId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    mastersService = new MastersService(testDb.db);
    workflowService = new WorkflowService(testDb.db);
    orderService = new OrderService(testDb.db);
    engineeringService = new EngineeringService(testDb.db);

    owner = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-RELEASE-TEST',
      email: 'owner@release.test',
      roles: ['OWNER', 'ENGINEER'],
    });

    engineer = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-RELEASE-TEST',
      email: 'engineer@release.test',
      roles: ['ENGINEER'],
    });

    sales = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-RELEASE-TEST',
      email: 'sales@release.test',
      roles: ['SALES'],
    });

    // Masters
    const pcs = await mastersService.createUom(
      owner.principal,
      { code: 'PCS', name: 'Pieces', dimension: 'PIECE', precision: 0 },
      'uom-pcs'
    );
    uomPcsId = pcs.data.id;

    const kg = await mastersService.createUom(
      owner.principal,
      { code: 'KG', name: 'Kilograms', dimension: 'WEIGHT', precision: 3 },
      'uom-kg'
    );
    uomKgId = kg.data.id;

    const cust = await mastersService.createCustomer(
      owner.principal,
      { code: 'CUST-VALVE-01', name: 'Hydraulic Valves Corp' },
      'cust-valves'
    );
    customerId = cust.data.id;

    const ot = await mastersService.createOrderType(
      owner.principal,
      { code: 'OT-VALVES', name: 'Valve Machining' },
      'ot-valves'
    );
    orderTypeId = ot.data.id;

    const raw = await mastersService.createItem(
      owner.principal,
      { code: 'RAW-STEEL-BILLET', name: 'Steel Billet 100mm', itemType: 'RAW', baseUomId: uomKgId },
      'item-raw-steel'
    );
    rawItemId = raw.data.id;

    const fg = await mastersService.createItem(
      owner.principal,
      { code: 'FG-VALVE-BODY', name: 'Hydraulic Valve Body', itemType: 'FINISHED', baseUomId: uomPcsId },
      'item-fg-valve'
    );
    fgItemId = fg.data.id;

    // Workflow Version 1: Turn -> Bore -> Final QC
    const tplRes = await workflowService.createTemplate(
      owner.principal,
      { orderTypeId, code: 'WF-VALVE-PROC', name: 'Valve Body Machining' },
      'tpl-valve-proc'
    );
    workflowTemplateId = tplRes.data.id;
    wfV1Id = tplRes.data.initialVersionId;

    const defV1 = {
      schemaVersion: 1,
      name: 'Valve Body Machining V1',
      nodes: [
        { key: 'OP-10', name: 'Lathe Turning', type: 'OPERATION' as const, plannedDurationMinutes: 60 },
        { key: 'OP-20', name: 'Boring & Milling', type: 'OPERATION' as const, plannedDurationMinutes: 90 },
        { key: 'QC-30', name: 'Pressure & Dimension QC', type: 'INSPECTION' as const, plannedDurationMinutes: 45 },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
      ],
    };

    await workflowService.saveVersionDraft(owner.principal, wfV1Id, { definition: defV1 }, 'save-v1');
    await workflowService.publishVersion(owner.principal, wfV1Id, 'pub-v1');

    // Create Order A and set up approved engineering revision with Workflow V1
    const orderRes = await orderService.createOrderDraft(
      sales.principal,
      {
        customerId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-15T00:00:00.000Z',
      },
      'cmd-order-a-create'
    );
    orderAId = orderRes.data.id;

    const revAId = orderRes.data.engineeringRevisions[0].id;
    await engineeringService.saveEngineeringDraft(
      engineer.principal,
      revAId,
      {
        workflowVersionId: wfV1Id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: rawItemId,
            inputUomId: uomKgId,
            requirementQuantity: 3.5, // 3.5 kg steel per 1 valve
            outputBasis: 1,
            allowancePercent: 4.0, // 4% scrap allowance
          },
        ],
      },
      'cmd-eng-a-save'
    );
    await engineeringService.approveEngineeringRevision(owner.principal, revAId, 'cmd-eng-a-approve');
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('enforces RBAC: only OWNER can release order, non-owners are denied', async () => {
    await expect(
      releaseOrder(sales.principal, orderAId, 'cmd-rel-sales-denied', testDb.db)
    ).rejects.toThrow(ForbiddenError);

    await expect(
      releaseOrder(engineer.principal, orderAId, 'cmd-rel-eng-denied', testDb.db)
    ).rejects.toThrow(ForbiddenError);
  });

  it('releases order A atomically: pins version 1, produces exact tasks, dependencies, and material demand', async () => {
    const releaseRes = await releaseOrder(owner.principal, orderAId, 'cmd-rel-order-a', testDb.db);

    expect(releaseRes.data.instanceId).toBeDefined();
    expect(releaseRes.data.moId).toBeDefined();
    expect(releaseRes.data.jobsheetId).toBeDefined();

    // Verify exactly 3 tasks created matching Workflow V1 nodes
    const taskIds = releaseRes.data.taskIds;
    expect(Object.keys(taskIds).sort()).toEqual(['OP-10', 'OP-20', 'QC-30']);

    // OP-10 has no predecessors, so status is READY
    const op10Task = await testDb.db.task.findUnique({ where: { id: taskIds['OP-10'] } });
    expect(op10Task?.status).toBe('READY');
    expect(op10Task?.attemptNumber).toBe(1);

    // OP-20 and QC-30 have predecessors, so status is PENDING
    const op20Task = await testDb.db.task.findUnique({ where: { id: taskIds['OP-20'] } });
    expect(op20Task?.status).toBe('PENDING');

    const qc30Task = await testDb.db.task.findUnique({ where: { id: taskIds['QC-30'] } });
    expect(qc30Task?.status).toBe('PENDING');

    // Verify task dependencies (OP-10 -> OP-20, OP-20 -> QC-30)
    const deps = await testDb.db.taskDependency.findMany({
      where: { instanceId: releaseRes.data.instanceId },
    });
    expect(deps.length).toBe(2);

    // Verify material demand calculation:
    // 10 ordered units * 3.5 kg = 35.0 kg base = 35,000,000 atoms
    // 4% allowance = 1,400,000 atoms -> total = 36,400,000 atoms
    const demands = await testDb.db.materialDemand.findMany({
      where: { orderId: orderAId },
    });
    expect(demands.length).toBe(1);
    expect(demands[0].requiredAtoms.toString()).toBe('36400000');
    expect(demands[0].taskId).toBe(taskIds['OP-10']);
    expect(demands[0].status).toBe('OPEN');

    // Verify WorkflowInstance pins Workflow V1
    const instance = await testDb.db.workflowInstance.findUnique({
      where: { id: releaseRes.data.instanceId },
    });
    expect(instance?.workflowVersionId).toBe(wfV1Id);
    expect(instance?.status).toBe('ACTIVE');

    // Verify Order status is now RELEASED
    const order = await testDb.db.order.findUnique({ where: { id: orderAId } });
    expect(order?.status).toBe('RELEASED');
    expect(order?.confirmedAt).toBeDefined();

    // Repeating the command returns the exact same IDs idempotently
    const replayRes = await releaseOrder(owner.principal, orderAId, 'cmd-rel-order-a', testDb.db);
    expect(replayRes.data.instanceId).toBe(releaseRes.data.instanceId);
    expect(replayRes.data.taskIds['OP-10']).toBe(taskIds['OP-10']);
  });

  it('publishes process version 2: existing order A stays on version 1, new order B pins version 2', async () => {
    // 1. Fork and create Workflow Version 2 with an additional deburr step
    const forkRes = await workflowService.forkVersion(engineer.principal, wfV1Id, 'cmd-fork-wf-v2');
    wfV2Id = forkRes.data.id;

    const defV2 = {
      schemaVersion: 1,
      name: 'Valve Body Machining V2 - with Deburr',
      nodes: [
        { key: 'OP-10', name: 'Lathe Turning', type: 'OPERATION' as const, plannedDurationMinutes: 60 },
        { key: 'OP-15', name: 'Deburr & Edge Break', type: 'OPERATION' as const, plannedDurationMinutes: 20 },
        { key: 'OP-20', name: 'Boring & Milling', type: 'OPERATION' as const, plannedDurationMinutes: 90 },
        { key: 'QC-30', name: 'Pressure & Dimension QC', type: 'INSPECTION' as const, plannedDurationMinutes: 45 },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-15', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-15', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
      ],
    };

    await workflowService.saveVersionDraft(engineer.principal, wfV2Id, { definition: defV2 }, 'save-wf-v2');
    await workflowService.publishVersion(owner.principal, wfV2Id, 'pub-wf-v2');

    // 2. Create Order B
    const orderBRes = await orderService.createOrderDraft(
      sales.principal,
      {
        customerId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-11-20T00:00:00.000Z',
      },
      'cmd-order-b-create'
    );
    const orderBId = orderBRes.data.id;
    const revBId = orderBRes.data.engineeringRevisions[0].id;

    // Save engineering for Order B explicitly linking to Workflow V2
    await engineeringService.saveEngineeringDraft(
      engineer.principal,
      revBId,
      {
        workflowVersionId: wfV2Id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: rawItemId,
            inputUomId: uomKgId,
            requirementQuantity: 3.5,
          },
        ],
      },
      'cmd-eng-b-save'
    );
    await engineeringService.approveEngineeringRevision(owner.principal, revBId, 'cmd-eng-b-approve');

    // 3. Release Order B
    const relBRes = await releaseOrder(owner.principal, orderBId, 'cmd-rel-order-b', testDb.db);

    // Order B pins Workflow V2 and has 4 tasks
    const instB = await testDb.db.workflowInstance.findUnique({
      where: { id: relBRes.data.instanceId },
      include: { tasks: true },
    });
    expect(instB?.workflowVersionId).toBe(wfV2Id);
    expect(instB?.tasks.length).toBe(4);
    expect(instB?.tasks.map((t) => t.nodeKey).sort()).toEqual(['OP-10', 'OP-15', 'OP-20', 'QC-30']);

    // Order A remains strictly on Workflow V1 with 3 tasks
    const instA = await testDb.db.workflowInstance.findFirst({
      where: { orderId: orderAId },
      include: { tasks: true },
    });
    expect(instA?.workflowVersionId).toBe(wfV1Id);
    expect(instA?.tasks.length).toBe(3);
  });

  it('releases each multi-item order line as its own pinned manufacturing job', async () => {
    const orderRes = await orderService.createOrderDraft(
      sales.principal,
      {
        customerId,
        orderTypeId,
        lines: [
          { itemId: fgItemId, orderedQuantity: 10 },
          { itemId: rawItemId, orderedQuantity: 20 },
        ],
        requestedDate: '2026-11-22T00:00:00.000Z',
      },
      'cmd-order-multi-line-release'
    );

    for (const revision of orderRes.data.engineeringRevisions) {
      await engineeringService.saveEngineeringDraft(
        engineer.principal,
        revision.id,
        { workflowVersionId: wfV1Id },
        `cmd-eng-multi-${revision.id}`
      );
      await engineeringService.approveEngineeringRevision(
        owner.principal,
        revision.id,
        `cmd-approve-multi-${revision.id}`
      );
    }

    const released = await releaseOrder(
      owner.principal,
      orderRes.data.id,
      'cmd-release-multi-line',
      testDb.db
    );
    const jobs = await testDb.db.manufacturingOrder.findMany({
      where: { orderId: orderRes.data.id },
      include: { orderLine: true, jobsheets: { include: { tasks: true } } },
      orderBy: { orderLineId: 'asc' },
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.orderLineId).sort()).toEqual(
      orderRes.data.lines.map((line: { id: string }) => line.id).sort()
    );
    expect(jobs.map((job) => job.targetAtoms).sort((a, b) => Number(a - b))).toEqual([
      10_000_000n,
      20_000_000n,
    ]);
    expect(jobs.every((job) => job.jobsheets.length === 1 && job.jobsheets[0].tasks.length === 3)).toBe(true);
    expect(released.data.jobs).toHaveLength(2);
  });
});
