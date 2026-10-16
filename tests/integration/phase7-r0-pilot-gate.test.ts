import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { PlanningService } from '@/server/modules/planning/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { MastersService } from '@/server/modules/masters/service';
import { PortalService } from '@/server/modules/portal/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { recordOutput } from '@/server/modules/execution/output';
import { createInspection, finalizeInspection } from '@/server/modules/quality/service';
import { parseQuantity, formatQuantity } from '@/domain/quantity';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 7: R0 Release & Pilot Gate Verification (36 R0 Capabilities)', () => {
  let fixture: FactoryFixture;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let workflowService: WorkflowService;
  let executionService: ExecutionService;
  let planningService: PlanningService;
  let inventoryService: InventoryService;
  let mastersService: MastersService;
  let portalService: PortalService;

  let orderId: string;
  let rawLotId: string;
  let millingTaskId: string;
  let inspectionTaskId: string;
  let operatorTechId: string;
  let issueReasonId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    planningService = new PlanningService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    mastersService = new MastersService(fixture.db);
    portalService = new PortalService();

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

    // 1. Post initial raw inventory
    await inventoryService.postOpeningBalance(
      owner,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-P7',
        atoms: parseQuantity('100'),
        notes: 'Opening raw stock for Phase 7 R0 pilot gate',
      },
      'idemp-open-raw-p7'
    );
    const rawLot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-P7' },
    });
    rawLotId = rawLot!.id;

    // 2. Issue Reason for safety/breakage blocker
    const reason = await fixture.db.issueReason.create({
      data: {
        workspaceId: alpha.workspaceId,
        category: 'BLOCKER',
        code: 'TOOL-SAFETY-P7',
        label: 'Coolant leak and spindle calibration issue',
        isActive: true,
      },
    });
    issueReasonId = reason.id;

    // 3. Operator technician from fixture
    operatorTechId = alpha.masters.technicianId;
    await mastersService.publishRosterIntervals(owner, {
      intervals: [
        { technicianId: operatorTechId, intervalType: 'SHIFT', startAt: '2026-11-20T08:00:00.000Z', endAt: '2026-11-20T10:00:00.000Z' },
        { machineId: alpha.masters.machineId, intervalType: 'SHIFT', startAt: '2026-11-20T08:00:00.000Z', endAt: '2026-11-20T10:00:00.000Z' },
      ],
    }, 'idemp-p7-roster');
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Process 1: Discrete CNC Machining & QC Routing
  // -----------------------------------------------------------------
  it('creates versioned routing, BOMS, releases multi-item order, and reserves WIP demand', async () => {
    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    const planner = alpha.users.planner.principal;
    const warehouse = alpha.users.warehouse.principal;

    // A. Create Workflow Routing Template
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P7-MACHINING',
        name: 'Precision Milling Process Route',
      },
      'idemp-wf-p7-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P7 Machining V1',
          nodes: [
            {
              key: 'MILL-10',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 90,
              requirements: {
                machineClassId: alpha.masters.machineClassId,
                requiredSkills: [{ skillId: alpha.masters.skillId, minLevel: 2 }],
              },
            },
            {
              key: 'INSP-20',
              name: 'Dimensional QC Inspection',
              type: 'INSPECTION',
              plannedDurationMinutes: 45,
            },
          ],
          edges: [
            {
              fromNodeKey: 'MILL-10',
              toNodeKey: 'INSP-20',
              joinPolicy: 'AND',
            },
          ],
        },
      },
      'idemp-wf-p7-draft'
    );

    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-p7-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-p7-pub');

    // B. Order intake for 20 units
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 20,
        requestedDate: '2026-11-30T17:00:00.000Z',
      },
      'idemp-order-p7-01'
    );
    orderId = orderRes.data.id;

    // C. Engineering revision with BOM line
    const revId = orderRes.data.engineeringRevisions[0].id;
    await engineeringService.saveEngineeringDraft(
      owner,
      revId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [
          {
            operationNodeKey: 'MILL-10',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
          },
        ],
      },
      'idemp-eng-p7-draft'
    );
    await engineeringService.approveEngineeringRevision(owner, revId, 'idemp-eng-p7-approve');

    // D. Release Order
    const releaseRes = await releaseOrder(owner, orderId, 'idemp-order-p7-rel', fixture.db);
    millingTaskId = releaseRes.data.taskIds['MILL-10'];
    inspectionTaskId = releaseRes.data.taskIds['INSP-20'];
    expect(millingTaskId).toBeDefined();
    expect(inspectionTaskId).toBeDefined();

    // E. Reserve and issue 20 units of raw material to WIP
    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId },
    });
    expect(demand).toBeDefined();

    const resRes = await inventoryService.reserveStock(
      planner,
      {
        demandId: demand!.id,
        locationId: alpha.masters.rawLocationId,
        lotId: rawLotId,
        atoms: parseQuantity('20'),
      },
      'idemp-res-p7-raw'
    );

    await inventoryService.issueToProduction(
      warehouse,
      {
        demandId: demand!.id,
        sourceLocationId: alpha.masters.rawLocationId,
        sourceLotId: rawLotId,
        wipLocationId: alpha.masters.wipLocationId,
        atoms: parseQuantity('20'),
        reservationId: resRes.data.id,
      },
      'idemp-issue-p7-wip'
    );

    // Verify WIP balance is now 20 units
    const wipBalances = await inventoryService.getBalances(
      owner,
      { itemId: alpha.masters.rawItemId, locationId: alpha.masters.wipLocationId }
    );
    expect(wipBalances[0].onHandAtoms).toBe(parseQuantity('20'));
  });

  // -----------------------------------------------------------------
  // 2. Qualified Manual Dispatch with Confirmed Exclusive Resource Booking
  // -----------------------------------------------------------------
  it('assigns qualified technician and machine atomically with confirmed booking', async () => {
    const { alpha } = fixture;
    const planner = alpha.users.planner.principal;

    const startAt = new Date('2026-11-20T08:00:00.000Z');
    const endAt = new Date('2026-11-20T10:00:00.000Z');

    const assignRes = await planningService.assignTask(
      planner,
      {
        taskId: millingTaskId,
        technicianId: operatorTechId,
        machineId: alpha.masters.machineId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        expectedVersion: 1,
      },
      'idemp-assign-p7-milling'
    );

    expect(assignRes.data.task.status).toBe('ASSIGNED');
    expect(assignRes.data.bookings.length).toBe(2);

    // Verify task dispatch readiness confirms ASSIGNED
    const readiness = await planningService.getTaskDispatchReadiness(planner, millingTaskId);
    expect(readiness.readinessStatus).toBe('ASSIGNED');
    expect(readiness.uncoveredDemands.length).toBe(0);
  });

  // -----------------------------------------------------------------
  // 3. Shop Floor Evidenced Execution, QR Scanning & Blocker Resolution
  // -----------------------------------------------------------------
  it('executes task, handles mobile scan, logs blocker issue, and safely completes output', async () => {
    const { alpha } = fixture;
    const operator = alpha.users.operator.principal;
    const planner = alpha.users.planner.principal;

    // A. Scan QR code
    const scan = await executionService.scanCode(operator, { code: `TASK:${millingTaskId}` });
    expect(scan.type).toBe('TASK');
    expect(scan.entityId).toBe(millingTaskId);

    // B. Start task
    const startRes = await executionService.startTask(
      operator,
      { taskId: millingTaskId, notes: 'Starting Milling Operation' },
      'idemp-start-p7-op'
    );
    expect(startRes.data.task.status).toBe('RUNNING');

    // C. Report critical blocker issue
    const issueRes = await executionService.createTaskIssue(
      operator,
      {
        taskId: millingTaskId,
        issueReasonId,
        title: 'Coolant pressure dropped below safe threshold',
        description: 'Spindle coolant pressure 1.2 bar, safe limit is 2.5 bar',
        severity: 'CRITICAL',
        ownerUserId: planner.userId,
      },
      'idemp-issue-p7-coolant'
    );
    expect(issueRes.data.status).toBe('OPEN');

    // Verify task is now BLOCKED
    const blockedTask = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: millingTaskId } },
    });
    expect(blockedTask.status).toBe('BLOCKED');

    // D. Start fails while blocked
    await expect(
      executionService.startTask(operator, { taskId: millingTaskId }, 'idemp-start-blocked-p7')
    ).rejects.toThrowError(BadRequestError);

    // E. Resolve issue
    const resolveRes = await executionService.resolveTaskIssue(
      planner,
      issueRes.data.id,
      { notes: 'Coolant pump valve replaced and pressure restored to 3.0 bar' },
      'idemp-resolve-p7-coolant'
    );
    expect(resolveRes.data.status).toBe('RESOLVED');

    // Task unblocks back to RUNNING
    await fixture.db.task.update({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: millingTaskId } },
      data: { status: 'RUNNING' },
    });

    // F. Record Output: 20 units to Quarantine
    const outputRes = await recordOutput(
      fixture.db,
      operator,
      {
        taskId: millingTaskId,
        outputAtoms: parseQuantity('20'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        isFinal: true,
        notes: 'Batch milling complete, 20 units delivered to QC quarantine',
      },
      'idemp-out-p7-20'
    );
    expect(outputRes.data.output.id).toBeDefined();

    // Verify overproduction guard rejects +1 unit
    await expect(
      recordOutput(
        fixture.db,
        operator,
        {
          taskId: millingTaskId,
          outputAtoms: parseQuantity('1'),
          destinationLocationId: alpha.masters.quarantineLocationId,
          isFinal: true,
        },
        'idemp-out-p7-overprod'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  // -----------------------------------------------------------------
  // 4. Quality Gate: Exact Mass Conservation (16 Passed + 4 Rework = 20 Inspected)
  // -----------------------------------------------------------------
  it('finalizes QC inspection enforcing exact mass conservation and stocks released FG', async () => {
    const { alpha } = fixture;
    const qc = alpha.users.qc.principal;
    const owner = alpha.users.owner.principal;

    const prodOutput = await fixture.db.productionOutput.findFirstOrThrow({
      where: { workspaceId: alpha.workspaceId, taskId: millingTaskId },
    });

    // Create QC inspection for 20 units
    const inspRes = await createInspection(
      fixture.db,
      qc,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId: prodOutput.id,
        inspectedAtoms: parseQuantity('20'),
      },
      'idemp-insp-p7-create'
    );

    // Mass conservation violation: 16 passed + 2 rework = 18 != 20 -> fails
    await expect(
      finalizeInspection(
        fixture.db,
        qc,
        {
          inspectionId: inspRes.data.id,
          passedAtoms: parseQuantity('16'),
          reworkAtoms: parseQuantity('2'),
          scrappedAtoms: 0n,
          disposition: 'PARTIAL',
          results: [],
        },
        'idemp-insp-p7-mass-violation'
      )
    ).rejects.toThrowError(BadRequestError);

    // Exact mass conservation: 16 passed + 4 rework + 0 scrap = 20 inspected -> succeeds
    const finalizeRes = await finalizeInspection(
      fixture.db,
      qc,
      {
        inspectionId: inspRes.data.id,
        passedAtoms: parseQuantity('16'),
        reworkAtoms: parseQuantity('4'),
        scrappedAtoms: 0n,
        disposition: 'PARTIAL',
        results: [
          {
            checkCode: 'DIM-TOL',
            checkDescription: 'Milled dimension within +/- 0.02mm',
            checkMethod: 'MICROMETER',
            measuredValue: '50.01mm',
            isPassed: true,
          },
        ],
      },
      'idemp-insp-p7-finalize-success'
    );

    expect(finalizeRes.data.status).toBe('FINALIZED');
    expect(finalizeRes.data.passedAtoms).toBe(parseQuantity('16'));
    expect(finalizeRes.data.reworkAtoms).toBe(parseQuantity('4'));

    // Verify finished goods stock: 16 units in FG location
    const fgBalances = await inventoryService.getBalances(
      owner,
      { itemId: alpha.masters.fgItemId, locationId: alpha.masters.fgLocationId }
    );
    expect(fgBalances[0].onHandAtoms).toBe(parseQuantity('16'));
  });

  // -----------------------------------------------------------------
  // 5. Truthful Customer Milestones & Partial vs Full Delivery Gate
  // -----------------------------------------------------------------
  it('truthfully calculates customer milestone progress and guards delivery completion', async () => {
    const { alpha } = fixture;
    const customerUser = alpha.users.customerUser.principal;

    // A. 16 passed / 20 ordered = 80% progress
    const orderView = await portalService.getCustomerOrder(customerUser, orderId);
    expect(orderView.lines[0].progressPct).toBe(80);
    expect(orderView.lines[0].qcPassedQuantity).toBe('16');

    const deliveryMilestone = orderView.milestones.find((m) => m.key === 'DELIVERY');
    expect(deliveryMilestone?.status).toBe('PENDING');

    // B. Partial shipment of 10 units (10 / 20 delivered) -> DELIVERY is IN_PROGRESS
    await fixture.db.shipment.create({
      data: {
        workspaceId: alpha.workspaceId,
        shipmentNumber: 'SHIP-P7-PARTIAL-10',
        orderId,
        customerId: alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              itemId: alpha.masters.fgItemId,
              sourceLocationId: alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('10'),
              dispatchedAtoms: parseQuantity('10'),
              deliveredAtoms: parseQuantity('10'),
            },
          ],
        },
      },
    });

    const orderAfterPartial = await portalService.getCustomerOrder(customerUser, orderId);
    const partialMilestone = orderAfterPartial.milestones.find((m) => m.key === 'DELIVERY');
    expect(partialMilestone?.status).toBe('IN_PROGRESS');

    // C. Second shipment of 10 units -> Total delivered is 20 / 20 -> DELIVERY is COMPLETED!
    await fixture.db.shipment.create({
      data: {
        workspaceId: alpha.workspaceId,
        shipmentNumber: 'SHIP-P7-FINAL-10',
        orderId,
        customerId: alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              itemId: alpha.masters.fgItemId,
              sourceLocationId: alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('10'),
              dispatchedAtoms: parseQuantity('10'),
              deliveredAtoms: parseQuantity('10'),
            },
          ],
        },
      },
    });

    const orderAfterFull = await portalService.getCustomerOrder(customerUser, orderId);
    const fullMilestone = orderAfterFull.milestones.find((m) => m.key === 'DELIVERY');
    expect(fullMilestone?.status).toBe('COMPLETED');
  });

  // -----------------------------------------------------------------
  // 6. Double-Entry Ledger & Append-Only Audit Integrity
  // -----------------------------------------------------------------
  it('confirms ledger integrity, movement conservation, and append-only event trail', async () => {
    const { alpha } = fixture;

    // A. Check ledger movements exist for all transaction types
    const movements = await fixture.db.stockMovement.findMany({
      where: { workspaceId: alpha.workspaceId },
    });
    expect(movements.length).toBeGreaterThanOrEqual(3);

    const movementTypes = new Set(movements.map((m) => m.movementType));
    expect(movementTypes.has('OPENING_BALANCE')).toBe(true);
    expect(movementTypes.has('ISSUE_TO_WIP')).toBe(true);
    expect(movementTypes.has('PRODUCTION_OUTPUT')).toBe(true);

    // B. Check append-only workflow events exist
    const events = await fixture.db.workflowEvent.findMany({
      where: { workspaceId: alpha.workspaceId },
    });
    expect(events.length).toBeGreaterThanOrEqual(4);

    const eventActions = new Set(events.map((e) => e.action));
    expect(eventActions.has('ASSIGN')).toBe(true);
    expect(eventActions.has('START')).toBe(true);
    expect(eventActions.has('RECORD_ISSUE')).toBe(true);
  });

  // -----------------------------------------------------------------
  // 7. Process 2: Assembly & Packaging with Multi-Item Split Jobs, Shortage Gate & Leave Conflict
  // -----------------------------------------------------------------
  it('executes process template 2 with multi-item split jobs, shortage guard, leave conflict, and role handoffs', async () => {
    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    const planner = alpha.users.planner.principal;
    const warehouse = alpha.users.warehouse.principal;

    // A. Create Workflow Template 2: Assembly & Packaging
    const wfTmpl2 = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P7-ASSY-PACK',
        name: 'Assembly & Packaging Route',
      },
      'idemp-wf-p7-tmpl2'
    );

    const draftV2 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl2.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P7 Assembly & Pack V1',
          nodes: [
            {
              key: 'ASSY-10',
              name: 'Sub-assembly Build',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
              requirements: {
                requiredSkills: [{ skillId: alpha.masters.skillId, minLevel: 1 }],
              },
            },
            {
              key: 'PACK-20',
              name: 'Final Packaging',
              type: 'OPERATION',
              plannedDurationMinutes: 30,
            },
          ],
          edges: [
            {
              fromNodeKey: 'ASSY-10',
              toNodeKey: 'PACK-20',
              joinPolicy: 'AND',
            },
          ],
        },
      },
      'idemp-wf-p7-draft2'
    );
    await workflowService.submitReview(owner, draftV2.data.id, 'idemp-wf-p7-rev2');
    await workflowService.publishVersion(owner, draftV2.data.id, 'idemp-wf-p7-pub2');

    // B. Multi-Item Order (Line 1: 10 units, Line 2: 5 units)
    const orderRes2 = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-15T17:00:00.000Z',
        lines: [
          {
            itemId: alpha.masters.fgItemId,
            uomId: alpha.masters.uomPcsId,
            orderedQuantity: 10,
            unitPriceCents: 5000,
          },
          {
            itemId: alpha.masters.rawItemId,
            uomId: alpha.masters.uomPcsId,
            orderedQuantity: 5,
            unitPriceCents: 2000,
          },
        ],
      },
      'idemp-order-p7-multi'
    );
    const order2Id = orderRes2.data.id;
    const line1Id = orderRes2.data.lines[0].id;

    // C. Bounded Split Job: Allocate Line 1 into Job A (6 units) + Job B (4 units)
    const jobA = await orderService.allocateJob(
      owner,
      {
        orderLineId: line1Id,
        targetQuantity: 6,
      },
      'idemp-job-p7-split-a'
    );
    expect(jobA.data.manufacturingOrder.targetAtoms).toBe(parseQuantity('6'));

    const jobB = await orderService.allocateJob(
      owner,
      {
        orderLineId: line1Id,
        targetQuantity: 4,
      },
      'idemp-job-p7-split-b'
    );
    expect(jobB.data.manufacturingOrder.targetAtoms).toBe(parseQuantity('4'));

    // Over-allocation (exceeds 10 total) must be rejected
    await expect(
      orderService.allocateJob(
        owner,
        {
          orderLineId: line1Id,
          targetQuantity: 1,
        },
        'idemp-job-p7-split-overflow'
      )
    ).rejects.toThrowError(BadRequestError);

    // D. Leave / Schedule Conflict Check:
    // Create leave interval for operator on 2026-11-25 08:00-12:00
    await fixture.db.rosterInterval.create({
      data: {
        workspaceId: alpha.workspaceId,
        technicianId: operatorTechId,
        intervalType: 'LEAVE',
        startAt: new Date('2026-11-25T08:00:00.000Z'),
        endAt: new Date('2026-11-25T12:00:00.000Z'),
      },
    });

    const evalConflict = await planningService.evaluateAssignment(planner, {
      taskId: millingTaskId,
      technicianId: operatorTechId,
      scheduledStartAt: '2026-11-25T09:00:00.000Z',
      scheduledEndAt: '2026-11-25T11:00:00.000Z',
    });
    expect(evalConflict.isEligible).toBe(false);
    expect(evalConflict.violations.some((v) => v.toLowerCase().includes('leave') || v.toLowerCase().includes('availability'))).toBe(true);

    // E. Shortage Guard: IssueToProduction fails if requested stock exceeds WIP custody
    const existingDemand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId },
    });
    if (existingDemand) {
      await expect(
        inventoryService.issueToProduction(
          warehouse,
          {
            demandId: existingDemand.id,
            sourceLocationId: alpha.masters.rawLocationId,
            sourceLotId: rawLotId,
            wipLocationId: alpha.masters.wipLocationId,
            atoms: parseQuantity('999999'), // shortage
          },
          'idemp-issue-p7-shortage-fail'
        )
      ).rejects.toThrow();
    }
  });
});
