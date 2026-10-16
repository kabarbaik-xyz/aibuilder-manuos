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
import { ExecutionService } from '@/server/modules/execution/service';
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
    // Output-focused tests begin with a real assigned operator.
    await fixture.db.task.update({ where: { id: taskId }, data: { assignedTechnicianId: alpha.masters.technicianId } });

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

  it('keeps partial output in progress, then completes from cumulative output and consumes WIP once', async () => {
    const { alpha } = fixture;
    const sessionStartedAt = new Date(Date.now() - 120_000);
    await fixture.db.task.update({ where: { id: taskId }, data: { status: 'RUNNING' } });
    const runningSession = await fixture.db.workSession.create({
      data: {
        workspaceId: alpha.workspaceId,
        taskId,
        technicianId: alpha.masters.technicianId,
        sessionType: 'RUNNING',
        startedAt: sessionStartedAt,
      },
    });

    const partialOutputRes = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('4'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-QC-001',
        isFinal: true,
      },
      'key-output-partial-4-units'
    );
    expect(partialOutputRes.data.output.outputAtoms).toBe(parseQuantity('4'));
    expect((await fixture.db.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('RUNNING');
    expect((await fixture.db.workSession.findUniqueOrThrow({ where: { id: runningSession.id } })).endedAt).toBeNull();
    const wipAfterPartial = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.rawItemId, locationId: alpha.masters.wipLocationId },
    );
    expect(wipAfterPartial.reduce((sum, balance) => sum + balance.onHandAtoms, 0n)).toBe(parseQuantity('6'));
    const partialRetry = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('4'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-QC-001',
        isFinal: true,
      },
      'key-output-partial-4-units',
    );
    expect(partialRetry.data.output.id).toBe(partialOutputRes.data.output.id);
    expect(await fixture.db.productionOutput.count({ where: { workspaceId: alpha.workspaceId, taskId } })).toBe(1);

    const outputRes = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('6'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-QC-001',
        isFinal: true,
      },
      'key-output-final-6-units'
    );

    const output = outputRes.data.output;
    expect(output.outputAtoms).toBe(parseQuantity('6'));
    expect(output.status).toBe('RECORDED');
    productionOutputId = output.id;

    const closedSession = await fixture.db.workSession.findUniqueOrThrow({ where: { id: runningSession.id } });
    const completedTask = await fixture.db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(closedSession.endedAt).toBeInstanceOf(Date);
    expect(closedSession.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(completedTask.actualDurationMinutes).toBe(closedSession.durationMinutes);

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

  it('derives final output authority from the workflow graph, not the request body', async () => {
    const { alpha } = fixture;
    const sourceTask = await fixture.db.task.findUniqueOrThrow({ where: { id: taskId } });
    const intermediate = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId: sourceTask.instanceId,
        jobsheetId: sourceTask.jobsheetId,
        nodeKey: 'OP-CLIENT-FINAL-OVERRIDE',
        assignedTechnicianId: alpha.masters.technicianId,
        status: 'READY',
        targetItemId: alpha.masters.fgItemId,
        targetAtoms: parseQuantity('1'),
      },
    });
    const successor = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId: sourceTask.instanceId,
        jobsheetId: sourceTask.jobsheetId,
        nodeKey: 'OP-CLIENT-FINAL-OVERRIDE-NEXT',
        status: 'PENDING',
        targetItemId: alpha.masters.fgItemId,
        targetAtoms: parseQuantity('1'),
      },
    });
    await fixture.db.taskDependency.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId: sourceTask.instanceId,
        predecessorTaskId: intermediate.id,
        successorTaskId: successor.id,
        policy: 'FINISH_TO_START',
      },
    });

    await expect(
      recordOutput(
        fixture.db,
        alpha.users.operator.principal,
        {
          taskId: intermediate.id,
          outputAtoms: parseQuantity('1'),
          destinationLocationId: alpha.masters.quarantineLocationId,
          isFinal: true,
        },
        'key-output-client-final-override'
      )
    ).rejects.toThrow('cannot be declared final');
  });

  it('does not allow QC inspection quantities to exceed physical output', async () => {
    const { alpha } = fixture;
    await expect(
      createInspection(
        fixture.db,
        alpha.users.qc.principal,
        {
          sourceType: 'PRODUCTION_OUTPUT',
          productionOutputId,
          inspectedAtoms: parseQuantity('10.000001'),
        },
        'key-insp-over-output-cap'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('caps final output by the matching order item line, not the aggregate order quantity', async () => {
    const { alpha } = fixture;
    const order = await fixture.db.order.findUniqueOrThrow({ where: { id: orderId } });
    await fixture.db.orderLine.create({
      data: {
        workspaceId: alpha.workspaceId,
        orderId,
        lineNumber: 2,
        itemId: alpha.masters.rawItemId,
        uomId: alpha.masters.uomPcsId,
        orderedAtoms: parseQuantity('90'),
      },
    });
    await fixture.db.order.update({
      where: { id: orderId },
      data: { orderedAtoms: order.orderedAtoms + parseQuantity('90') },
    });
    const sourceTask = await fixture.db.task.findUniqueOrThrow({ where: { id: taskId } });
    const secondTask = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId: sourceTask.instanceId,
        jobsheetId: sourceTask.jobsheetId,
        nodeKey: 'OP-SECOND-FINAL',
        assignedTechnicianId: alpha.masters.technicianId,
        status: 'READY',
        targetItemId: alpha.masters.fgItemId,
        targetAtoms: parseQuantity('10'),
      },
    });

    await expect(
      recordOutput(
        fixture.db,
        alpha.users.operator.principal,
        {
          taskId: secondTask.id,
          outputAtoms: parseQuantity('11'),
          destinationLocationId: alpha.masters.quarantineLocationId,
          isFinal: true,
        },
        'key-output-item-line-over-cap'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('finalizes QC inspection: 8 passed to FG and 2 rework held in quarantine', async () => {
    const { alpha } = fixture;

    const partialOutput = await fixture.db.productionOutput.findFirstOrThrow({
      where: { workspaceId: alpha.workspaceId, taskId, outputAtoms: parseQuantity('4') },
      select: { id: true },
    });
    const partialInspection = await createInspection(
      fixture.db,
      alpha.users.qc.principal,
      { sourceType: 'PRODUCTION_OUTPUT', productionOutputId: partialOutput.id, inspectedAtoms: parseQuantity('4') },
      'key-insp-partial-output-4',
    );
    await finalizeInspection(
      fixture.db,
      alpha.users.qc.principal,
      { inspectionId: partialInspection.data.id, passedAtoms: parseQuantity('4'), reworkAtoms: 0n, scrappedAtoms: 0n, disposition: 'PASSED' },
      'key-finalize-insp-partial-output-4',
    );

    // Inspect the remaining output separately; both dispositions still reconcile to the batch total.
    const inspRes = await createInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: parseQuantity('6'),
      },
      'key-insp-initial-10'
    );
    const inspection = inspRes.data;
    inspectionId = inspection.id;

    // Finalize this output: 4 passed to FG, 2 rework. The earlier partial output passed 4.
    const finalizeRes = await finalizeInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        inspectionId: inspection.id,
        passedAtoms: parseQuantity('4'),
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
    expect(finalized.passedAtoms).toBe(parseQuantity('4'));
    expect(finalized.reworkAtoms).toBe(parseQuantity('2'));

    // Verify inventory balances:
    // FG Location has 4 units from each output (8 total).
    const fgBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(fgBalance.reduce((sum, balance) => sum + balance.onHandAtoms, 0n)).toBe(parseQuantity('8'));

    // Quarantine Location has 2 units remaining
    const qBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.quarantineLocationId }
    );
    expect(qBalance.reduce((sum, balance) => sum + balance.onHandAtoms, 0n)).toBe(parseQuantity('2'));
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

    // Reinspection reclassifies the existing two units: one passed and one scrapped.
    const reinspectionRes = await recordReinspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        originalInspectionId: inspectionId,
        reworkAttemptId: reworkRes.data.id,
        passedAtoms: parseQuantity('1'),
        scrappedAtoms: parseQuantity('1'),
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
    expect(reinspection.passedAtoms).toBe(parseQuantity('1'));
    expect(reinspection.scrappedAtoms).toBe(parseQuantity('1'));

    // Invariant check:
    // Total in FG plus SCRAP must remain EXACTLY 10 (8 accepted + 1 reworked + 1 scrapped).
    const fgBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(fgBalance.reduce((sum, balance) => sum + balance.onHandAtoms, 0n)).toBe(parseQuantity('9'));

    // Quarantine Location must now have 0 units
    const qBalance = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.quarantineLocationId }
    );
    const qOnHand = qBalance.reduce((sum, b) => sum + b.onHandAtoms, 0n);
    expect(qOnHand).toBe(0n);
    const scrapBalances = await inventoryService.getBalances(
      alpha.users.warehouse.principal,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.scrapLocationId }
    );
    expect(scrapBalances.reduce((sum, balance) => sum + balance.onHandAtoms, 0n)).toBe(parseQuantity('1'));

    const executionDetail = await new ExecutionService(fixture.db).getTaskExecutionDetail(
      alpha.users.operator.principal,
      taskId,
    );
    expect(executionDetail.stageQuantitySummary).toMatchObject({
      stageInputCapAtoms: parseQuantity('10').toString(),
      cumulativeRecordedAtoms: parseQuantity('10').toString(),
      cumulativeScrapAtoms: parseQuantity('1').toString(),
      cumulativeReworkInAtoms: parseQuantity('2').toString(),
      cumulativeReworkOutAtoms: parseQuantity('2').toString(),
      remainingRecordableAtoms: '0',
    });
  });
});
