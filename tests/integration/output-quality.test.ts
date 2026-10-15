import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { releaseOrder } from '@/server/modules/orders/release';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { InventoryService } from '@/server/modules/inventory/service';
import {
  createInspection,
  finalizeInspection,
  authorizeRework,
  recordReinspection,
} from '@/server/modules/quality/service';
import { recordOutput } from '@/server/modules/execution/output';
import { parseQuantity } from '@/domain/quantity';
import { BadRequestError } from '@/domain/errors';

describe('O06: Production Output, QC Inspection, Rework and Released FG', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let inventoryService: InventoryService;

  let orderId: string;
  let taskId: string;
  let inspectionId: string;
  let productionOutputId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    inventoryService = new InventoryService(fixture.db);

    const { alpha } = fixture;

    // 1. Post initial raw material stock to raw location: 100 units (100,000,000 atoms)
    const openRes = await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-QC-01',
        atoms: parseQuantity('100'),
        notes: 'Initial raw stock for production',
      },
      'key-open-raw-stock'
    );
    const rawLot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-QC-01' },
    });
    const rawLotId = rawLot!.id;

    // 2. Create Workflow Template with single node OP-10
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-BRACKET-QC',
        name: 'Bracket QC Flow',
      },
      'key-wf-qc-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Bracket QC V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'key-draft-v1'
    );

    await workflowService.publishVersion(
      alpha.users.owner.principal,
      draftV1.data.id,
      'key-pub-v1'
    );

    // 3. Create Order for 10 units (10,000,000 atoms)
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T00:00:00Z',
      },
      'key-order-qc-001'
    );
    orderId = orderRes.data.id;
    const revId = orderRes.data.engineeringRevisions[0].id;

    // 4. Configure and Approve Engineering BOM Revision (1 RAW per 1 FG)
    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'key-eng-qc-bom'
    );

    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revId,
      'key-eng-qc-approve'
    );

    // 5. Release Order -> Creates MO, Jobsheet, Tasks, Demands
    const releaseRes = await releaseOrder(
      alpha.users.owner.principal,
      orderId,
      'key-order-qc-release',
      fixture.db
    );

    taskId = releaseRes.data.taskIds['OP-10'];
    expect(taskId).toBeDefined();

    // 6. Issue 10 units from RAW to WIP
    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId },
    });
    expect(demand).toBeDefined();

    const resRes = await inventoryService.reserveStock(
      alpha.users.planner.principal,
      {
        demandId: demand!.id,
        locationId: alpha.masters.rawLocationId,
        lotId: rawLotId,
        atoms: parseQuantity('10'),
      },
      'key-reserve-raw-10'
    );

    await inventoryService.issueToProduction(
      alpha.users.warehouse.principal,
      {
        demandId: demand!.id,
        sourceLocationId: alpha.masters.rawLocationId,
        sourceLotId: rawLotId,
        wipLocationId: alpha.masters.wipLocationId,
        atoms: parseQuantity('10'),
        reservationId: resRes.data.id,
      },
      'key-issue-raw-10'
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('records output to quarantine and consumes issued WIP material', async () => {
    const { alpha } = fixture;

    // Record output of 10 units
    const outputRes = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('10'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-QC-001',
        isFinal: true,
      },
      'key-output-10-units'
    );

    const output = outputRes.data.output;
    expect(output.outputAtoms).toBe(parseQuantity('10'));
    expect(output.status).toBe('RECORDED');
    productionOutputId = output.id;

    // Verify stock balance: 10 units in QUARANTINE
    const balances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.quarantineLocationId }
    );
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(parseQuantity('10'));

    // Verify WIP raw material was consumed (onHand in WIP is 0)
    const wipBalances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.rawItemId, locationId: alpha.masters.wipLocationId }
    );
    const wipOnHand = wipBalances.reduce((sum, b) => sum + b.onHandAtoms, 0n);
    expect(wipOnHand).toBe(0n);
  });

  it('guards against overproduction beyond ordered quantity', async () => {
    const { alpha } = fixture;

    // Attempting to record 1 more unit should fail overproduction guard
    await expect(
      recordOutput(
        fixture.db,
        alpha.users.operator.principal,
        {
          taskId,
          outputAtoms: parseQuantity('1'),
          destinationLocationId: alpha.masters.quarantineLocationId,
        },
        'key-overproduction-attempt'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('finalizes QC inspection: 8 passed to FG and 2 rework held in quarantine', async () => {
    const { alpha } = fixture;

    // Create inspection
    const inspRes = await createInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: parseQuantity('10'),
      },
      'key-insp-initial-10'
    );
    const inspection = inspRes.data;
    inspectionId = inspection.id;

    // Finalize inspection: 8 passed to FG, 2 rework
    const finalizeRes = await finalizeInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        inspectionId: inspection.id,
        passedAtoms: parseQuantity('8'),
        reworkAtoms: parseQuantity('2'),
        scrappedAtoms: 0n,
        disposition: 'PARTIAL',
        results: [
          {
            checkCode: 'DIM-01',
            checkDescription: 'Length and width dimension check',
            checkMethod: 'CALIPER',
            measuredValue: '100.2mm',
            isPassed: true,
          },
          {
            checkCode: 'SURF-02',
            checkDescription: 'Surface roughness inspection',
            checkMethod: 'VISUAL',
            isPassed: false,
            defectReason: 'Minor burr on 2 units',
          },
        ],
      },
      'key-finalize-insp-10'
    );

    const finalized = finalizeRes.data;
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.passedAtoms).toBe(parseQuantity('8'));
    expect(finalized.reworkAtoms).toBe(parseQuantity('2'));

    // Verify inventory balances:
    // FG Location has 8 units
    const fgBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(fgBalance[0].onHandAtoms).toBe(parseQuantity('8'));

    // Quarantine Location has 2 units remaining
    const qBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.quarantineLocationId }
    );
    expect(qBalance[0].onHandAtoms).toBe(parseQuantity('2'));
  });

  it('re-inspects rework units and strictly conserves physical quantity (totals 10, never 12)', async () => {
    const { alpha } = fixture;

    // Authorize rework
    const reworkRes = await authorizeRework(
      fixture.db,
      alpha.users.qc.principal,
      {
        inspectionId,
        taskId,
        targetAtoms: parseQuantity('2'),
        instruction: 'Deburr edges using hand deburring tool and clean',
      },
      'key-rework-auth-2'
    );
    expect(reworkRes.data.targetAtoms).toBe(parseQuantity('2'));

    // Record reinspection: 2 units now passed to FG
    const reinspectionRes = await recordReinspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        originalInspectionId: inspectionId,
        reworkAttemptId: reworkRes.data.id,
        passedAtoms: parseQuantity('2'),
        scrappedAtoms: 0n,
        results: [
          {
            checkCode: 'SURF-02-RECHECK',
            checkDescription: 'Surface deburr verification',
            checkMethod: 'VISUAL',
            isPassed: true,
          },
        ],
      },
      'key-reinspection-pass-2'
    );

    const reinspection = reinspectionRes.data;
    expect(reinspection.status).toBe('FINALIZED');
    expect(reinspection.passedAtoms).toBe(parseQuantity('2'));

    // Invariant check:
    // Total in FG Location must be EXACTLY 10 (8 from first pass + 2 from reinspection)
    const fgBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(fgBalance[0].onHandAtoms).toBe(parseQuantity('10'));

    // Quarantine Location must now have 0 units
    const qBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.quarantineLocationId }
    );
    const qOnHand = qBalance.reduce((sum, b) => sum + b.onHandAtoms, 0n);
    expect(qOnHand).toBe(0n);
  });
});
