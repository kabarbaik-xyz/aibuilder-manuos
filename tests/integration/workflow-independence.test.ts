import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess, TestAccessResult } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { PrismaClient } from '@prisma/client';
import { BadRequestError } from '@/domain/errors';

describe('W06: Workflow Independence, Multi-Type Proof & Restart Persistence', () => {
  let testDb: TestDatabase;
  let mastersService: MastersService;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;

  let ownerEngineer: TestAccessResult;
  let operator: TestAccessResult;

  // Master catalog IDs
  let uomPcsId: string;
  let uomGramsId: string;
  let customerBetaId: string;
  let orderTypeElectronicsId: string;
  let itemPcbId: string;
  let itemChipId: string;
  let itemSolderId: string;
  let deptSmtId: string;
  let deptInspectionId: string;
  let qcChecklistId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    mastersService = new MastersService(testDb.db);
    workflowService = new WorkflowService(testDb.db);
    orderService = new OrderService(testDb.db);
    engineeringService = new EngineeringService(testDb.db);

    ownerEngineer = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-INDEP-TEST',
      email: 'owner@indep.test',
      roles: ['OWNER', 'ENGINEER'],
    });

    operator = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-INDEP-TEST',
      email: 'operator@indep.test',
      roles: ['OPERATOR'],
    });

    // Masters Setup for Electronics
    const pcs = await mastersService.createUom(
      ownerEngineer.principal,
      { code: 'PCS', name: 'Pieces', dimension: 'PIECE', precision: 0 },
      'cmd-uom-pcs'
    );
    uomPcsId = pcs.data.id;

    const grams = await mastersService.createUom(
      ownerEngineer.principal,
      { code: 'G', name: 'Grams', dimension: 'WEIGHT', precision: 2 },
      'cmd-uom-g'
    );
    uomGramsId = grams.data.id;

    const cust = await mastersService.createCustomer(
      ownerEngineer.principal,
      { code: 'CUST-BETA-ELEC', name: 'Beta Avionics Technologies Ltd' },
      'cmd-cust-beta'
    );
    customerBetaId = cust.data.id;

    const otype = await mastersService.createOrderType(
      ownerEngineer.principal,
      { code: 'OT-PCBA', name: 'Printed Circuit Board Assembly' },
      'cmd-ot-pcba'
    );
    orderTypeElectronicsId = otype.data.id;

    const fg = await mastersService.createItem(
      ownerEngineer.principal,
      { code: 'PCBA-CTRL-V2', name: 'Flight Controller Mainboard V2', itemType: 'FINISHED', baseUomId: uomPcsId, tracking: 'SERIAL' },
      'cmd-item-pcba'
    );
    itemPcbId = fg.data.id;

    const raw1 = await mastersService.createItem(
      ownerEngineer.principal,
      { code: 'IC-MCU-ARM', name: 'ARM Cortex-M7 Microcontroller', itemType: 'RAW', baseUomId: uomPcsId, tracking: 'LOT' },
      'cmd-item-mcu'
    );
    itemChipId = raw1.data.id;

    const raw2 = await mastersService.createItem(
      ownerEngineer.principal,
      { code: 'SOLDER-LEADFREE', name: 'SAC305 Lead-Free Solder Paste', itemType: 'RAW', baseUomId: uomGramsId, tracking: 'LOT' },
      'cmd-item-solder'
    );
    itemSolderId = raw2.data.id;

    const d1 = await mastersService.createDepartment(
      ownerEngineer.principal,
      { code: 'DEPT-SMT', name: 'Surface Mount Technology Line' },
      'cmd-dept-smt'
    );
    deptSmtId = d1.data.id;

    const d2 = await mastersService.createDepartment(
      ownerEngineer.principal,
      { code: 'DEPT-QC', name: 'Electronics Inspection & Testing' },
      'cmd-dept-qc'
    );
    deptInspectionId = d2.data.id;

    const qc = await mastersService.createQcChecklist(
      ownerEngineer.principal,
      {
        code: 'QC-IPC610',
        name: 'IPC-A-610 Class 3 Avionics Inspection',
        revision: 1,
        checks: [
          {
            code: 'SOLDER-01',
            description: 'Check solder fillet and wetting per IPC-A-610 standard',
            method: 'VISUAL',
            isRequired: true,
          },
        ],
      },
      'cmd-qc-ipc'
    );
    qcChecklistId = qc.data.id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('proves multi-type workflow independence: authors a diamond DAG with declared parallel branches and AND-join', async () => {
    // 1. Create Workflow Template B (Diamond DAG)
    const tplB = await workflowService.createTemplate(
      ownerEngineer.principal,
      {
        code: 'WF-PCBA-DIAMOND',
        name: 'PCBA Diamond Routing with Parallel AOI and X-Ray',
        orderTypeId: orderTypeElectronicsId,
      },
      'cmd-tpl-b'
    );
    const templateBId = tplB.data.id;
    const version1Id = tplB.data.initialVersionId;

    // Diamond Routing:
    // SMT-10 -> AOI-20 (Branch 1)
    // SMT-10 -> XRAY-21 (Branch 2 - parallel)
    // Both join into COAT-30 (AND join)
    // COAT-30 -> FINAL-QC-40
    const diamondDefinition = {
      schemaVersion: 1,
      nodes: [
        {
          key: 'SMT-10',
          name: 'High-Speed SMT Component Placement',
          type: 'OPERATION' as const,
          departmentId: deptSmtId,
          plannedDurationMinutes: 30,
        },
        {
          key: 'AOI-20',
          name: 'Automated Optical Inspection',
          type: 'INSPECTION' as const,
          departmentId: deptInspectionId,
          plannedDurationMinutes: 10,
        },
        {
          key: 'XRAY-21',
          name: 'BGA Void & Solder X-Ray Inspection',
          type: 'INSPECTION' as const,
          departmentId: deptInspectionId,
          plannedDurationMinutes: 15,
        },
        {
          key: 'COAT-30',
          name: 'Conformal Coating Application',
          type: 'OPERATION' as const,
          departmentId: deptSmtId,
          plannedDurationMinutes: 20,
        },
        {
          key: 'FINAL-QC-40',
          name: 'IPC-A-610 Final QA Release',
          type: 'INSPECTION' as const,
          departmentId: deptInspectionId,
          plannedDurationMinutes: 10,
          formGuard: {
            qcChecklistId,
            requireSignOff: true,
          },
        },
      ],
      edges: [
        { fromNodeKey: 'SMT-10', toNodeKey: 'AOI-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'SMT-10', toNodeKey: 'XRAY-21', joinPolicy: 'AND' as const },
        { fromNodeKey: 'AOI-20', toNodeKey: 'COAT-30', joinPolicy: 'AND' as const },
        { fromNodeKey: 'XRAY-21', toNodeKey: 'COAT-30', joinPolicy: 'AND' as const },
        { fromNodeKey: 'COAT-30', toNodeKey: 'FINAL-QC-40', joinPolicy: 'AND' as const },
      ],
    };

    // Save definition on Draft v1
    await workflowService.saveVersionDraft(
      ownerEngineer.principal,
      version1Id,
      { definition: diamondDefinition },
      'cmd-save-v1'
    );

    // Submit review & publish Version 1
    await workflowService.submitReview(ownerEngineer.principal, version1Id, 'cmd-sub-v1');
    const pubV1 = await workflowService.publishVersion(ownerEngineer.principal, version1Id, 'cmd-pub-v1');
    expect(pubV1.data.status).toBe('PUBLISHED');
    expect(pubV1.data.versionNumber).toBe(1);

    // 2. Create Order B for 50 PCB units
    const orderB = await orderService.createOrderDraft(
      ownerEngineer.principal,
      {
        customerId: customerBetaId,
        orderTypeId: orderTypeElectronicsId,
        itemId: itemPcbId,
        orderedQuantity: 50,
        requestedDate: '2026-12-01T00:00:00.000Z',
        rfqText: 'Avionics PCBA high reliability run, Class 3.',
      },
      'cmd-ord-b'
    );
    const orderBId = orderB.data.id;
    const revBId = orderB.data.engineeringRevisions[0].id;

    // 3. Configure Engineering Revision B with multi-item BOM
    await engineeringService.saveEngineeringDraft(
      ownerEngineer.principal,
      revBId,
      {
        expectedVersion: 1,
        workflowVersionId: version1Id,
        specs: { ipcStandard: 'IPC-A-610 Class 3' },
        bomLines: [
          {
            operationNodeKey: 'SMT-10',
            itemId: itemChipId,
            inputUomId: uomPcsId,
            requirementQuantity: 1, // 1 chip per board
            outputBasis: 1,
            allowancePercent: 2.0,
          },
          {
            operationNodeKey: 'SMT-10',
            itemId: itemSolderId,
            inputUomId: uomGramsId,
            requirementQuantity: 15.5, // 15.5g paste per board
            outputBasis: 1,
            allowancePercent: 5.0,
          },
        ],
      },
      'cmd-eng-b-save'
    );

    // Submit and approve Engineering Revision B
    await engineeringService.submitEngineeringReview(ownerEngineer.principal, revBId, 'cmd-eng-b-sub');
    await engineeringService.approveEngineeringRevision(ownerEngineer.principal, revBId, 'cmd-eng-b-app');

    // 4. Release Order B to production
    const releaseB = await releaseOrder(ownerEngineer.principal, orderBId, 'cmd-release-b', testDb.db);
    expect(releaseB.data.instanceId).toBeDefined();
    expect(Object.keys(releaseB.data.taskIds)).toHaveLength(5);
    expect(releaseB.data.demandIds).toHaveLength(2); // 2 BOM lines

    // Verify diamond DAG dependency links in the database
    const dbDependencies = await testDb.db.taskDependency.findMany({
      where: {
        instanceId: releaseB.data.instanceId,
      },
      include: {
        predecessor: true,
        successor: true,
      },
    });

    // We have 5 edges in the DAG:
    // SMT-10 -> AOI-20, SMT-10 -> XRAY-21, AOI-20 -> COAT-30, XRAY-21 -> COAT-30, COAT-30 -> FINAL-QC-40
    expect(dbDependencies).toHaveLength(5);

    // COAT-30 must have 2 predecessors: AOI-20 and XRAY-21
    const coatPredecessors = dbDependencies
      .filter((d) => d.successor.nodeKey === 'COAT-30')
      .map((d) => d.predecessor.nodeKey)
      .sort();
    expect(coatPredecessors).toEqual(['AOI-20', 'XRAY-21']);

    // 5. Version Evolution: Fork Draft Version 2 of Workflow B and publish
    const v2Draft = await workflowService.forkVersion(
      ownerEngineer.principal,
      version1Id,
      'cmd-fork-v2'
    );
    const version2Id = v2Draft.data.id;
    expect(v2Draft.data.versionNumber).toBe(2);

    // Update Version 2 to include a Pre-Bake operation (6 nodes)
    const v2Definition = {
      schemaVersion: 1,
      nodes: [
        { key: 'PRE-BAKE-05', name: 'PCB Moisture Pre-Bake 120C', type: 'OPERATION' as const, departmentId: deptSmtId, plannedDurationMinutes: 120 },
        ...diamondDefinition.nodes,
      ],
      edges: [
        { fromNodeKey: 'PRE-BAKE-05', toNodeKey: 'SMT-10', joinPolicy: 'AND' as const },
        ...diamondDefinition.edges,
      ],
    };

    await workflowService.saveVersionDraft(
      ownerEngineer.principal,
      version2Id,
      { definition: v2Definition },
      'cmd-save-v2'
    );
    await workflowService.submitReview(ownerEngineer.principal, version2Id, 'cmd-sub-v2');
    await workflowService.publishVersion(ownerEngineer.principal, version2Id, 'cmd-pub-v2');

    // 6. Create Order C using Version 2
    const orderC = await orderService.createOrderDraft(
      ownerEngineer.principal,
      {
        customerId: customerBetaId,
        orderTypeId: orderTypeElectronicsId,
        itemId: itemPcbId,
        orderedQuantity: 20,
        requestedDate: '2026-12-15T00:00:00.000Z',
      },
      'cmd-ord-c'
    );
    const orderCId = orderC.data.id;
    const revCId = orderC.data.engineeringRevisions[0].id;

    await engineeringService.saveEngineeringDraft(
      ownerEngineer.principal,
      revCId,
      {
        expectedVersion: 1,
        workflowVersionId: version2Id,
        bomLines: [],
      },
      'cmd-eng-c-save'
    );
    await engineeringService.submitEngineeringReview(ownerEngineer.principal, revCId, 'cmd-eng-c-sub');
    await engineeringService.approveEngineeringRevision(ownerEngineer.principal, revCId, 'cmd-eng-c-app');

    const releaseC = await releaseOrder(ownerEngineer.principal, orderCId, 'cmd-release-c', testDb.db);
    expect(Object.keys(releaseC.data.taskIds)).toHaveLength(6); // 6 tasks including PRE-BAKE-05

    // 7. Verify Version Immutability: Order B instance is pinned to Version 1 (5 tasks), Order C is pinned to Version 2 (6 tasks)
    const instanceB = await testDb.db.workflowInstance.findFirst({
      where: { orderId: orderBId },
      include: { tasks: true, workflowVersion: true },
    });
    expect(instanceB?.workflowVersion.versionNumber).toBe(1);
    expect(instanceB?.tasks).toHaveLength(5);

    const instanceC = await testDb.db.workflowInstance.findFirst({
      where: { orderId: orderCId },
      include: { tasks: true, workflowVersion: true },
    });
    expect(instanceC?.workflowVersion.versionNumber).toBe(2);
    expect(instanceC?.tasks).toHaveLength(6);

    // 8. Test Denial & Guard Rules
    // a. Attempting to release an unapproved revision throws error
    const orderD = await orderService.createOrderDraft(
      ownerEngineer.principal,
      {
        customerId: customerBetaId,
        orderTypeId: orderTypeElectronicsId,
        itemId: itemPcbId,
        orderedQuantity: 5,
        requestedDate: '2026-12-20T00:00:00.000Z',
      },
      'cmd-ord-d'
    );
    await orderService.confirmOrder(ownerEngineer.principal, orderD.data.id, 'cmd-confirm-d');
    await expect(
      releaseOrder(ownerEngineer.principal, orderD.data.id, 'cmd-rel-d-fail', testDb.db)
    ).rejects.toThrow(/has no APPROVED engineering revision/);

    // 9. Simulated Restart: Open a brand new Prisma Client connection to the SQLite database
    const freshDb = new PrismaClient({
      datasources: { db: { url: testDb.url } },
    });

    try {
      const persistedOrderB = await freshDb.order.findUnique({
        where: { id: orderBId },
        include: {
          instances: {
            include: {
              tasks: true,
            },
          },
          demands: true,
        },
      });

      expect(persistedOrderB).not.toBeNull();
      expect(persistedOrderB?.status).toBe('RELEASED');
      expect(persistedOrderB?.instances).toHaveLength(1);
      expect(persistedOrderB?.instances[0].tasks).toHaveLength(5);
      expect(persistedOrderB?.demands).toHaveLength(2);

      const persistedDeps = await freshDb.taskDependency.findMany({
        where: { instanceId: persistedOrderB!.instances[0].id },
      });
      expect(persistedDeps).toHaveLength(5);

      const persistedOrderC = await freshDb.order.findUnique({
        where: { id: orderCId },
        include: {
          instances: {
            include: { tasks: true },
          },
        },
      });

      expect(persistedOrderC?.instances[0].tasks).toHaveLength(6);
    } finally {
      await freshDb.$disconnect();
    }
  });
});
