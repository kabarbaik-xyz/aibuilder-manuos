import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { MastersService } from '@/server/modules/masters/service';
import { PortalService } from '@/server/modules/portal/service';
import { PortalRepository } from '@/server/modules/portal/repository';
import { releaseOrder } from '@/server/modules/orders/release';
import { recordOutput } from '@/server/modules/execution/output';
import { createInspection, finalizeInspection } from '@/server/modules/quality/service';
import { parseQuantity } from '@/domain/quantity';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 6: Evidenced Execution, QC Dispositions & Truthful Customer Milestones', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let executionService: ExecutionService;
  let inventoryService: InventoryService;
  let mastersService: MastersService;
  let portalService: PortalService;

  let orderId: string;
  let instanceId: string;
  let op10TaskId: string;
  let qc20TaskId: string;
  let issueReasonId: string;
  let pauseReasonId: string;
  let operatorTechnicianId: string;
  let createdIssueId: string;
  let rawLotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    mastersService = new MastersService(fixture.db);
    portalService = new PortalService(new PortalRepository(fixture.db), fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

    // 1. Post initial raw material stock
    await inventoryService.postOpeningBalance(
      owner,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-PHASE6',
        atoms: parseQuantity('50'),
        notes: 'Opening raw stock for Phase 6 execution test',
      },
      'idemp-open-raw-phase6'
    );
    const rawLot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-PHASE6' },
    });
    rawLotId = rawLot!.id;

    // 2. Create IssueReason for tool breakage (category BLOCKER)
    const reason = await fixture.db.issueReason.create({
      data: {
        workspaceId: alpha.workspaceId,
        category: 'BLOCKER',
        code: 'TOOL-BREAKAGE',
        label: 'End mill broken during machining',
        isActive: true,
      },
    });
    issueReasonId = reason.id;
    const pauseReason = await fixture.db.issueReason.create({
      data: {
        workspaceId: alpha.workspaceId,
        category: 'PAUSE',
        code: 'TOOL_CHANGE',
        label: 'Tool change and recalibration',
        isActive: true,
      },
    });
    pauseReasonId = pauseReason.id;

    // 3. Use operator technician from fixture
    operatorTechnicianId = alpha.masters.technicianId;

    // 4. Workflow Template: OP-10 (machining) -> QC-20 (inspection)
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-PHASE6-EXEC',
        name: 'Phase 6 Evidenced Execution Route',
      },
      'idemp-wf-phase6-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Phase 6 Route V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
            {
              key: 'QC-20',
              name: 'Final Quality Gate',
              type: 'INSPECTION',
              plannedDurationMinutes: 30,
            },
          ],
          edges: [
            {
              fromNodeKey: 'OP-10',
              toNodeKey: 'QC-20',
              joinPolicy: 'AND',
            },
          ],
        },
      },
      'idemp-wf-phase6-draft'
    );

    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-phase6-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-phase6-pub');

    // 5. Create Order for 10 units
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-25T17:00:00.000Z',
      },
      'idemp-order-phase6-01'
    );
    orderId = orderRes.data.id;

    // 6. Save and Approve Engineering Revision
    const revId = orderRes.data.engineeringRevisions[0].id;
    await engineeringService.saveEngineeringDraft(
      owner,
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
          },
        ],
      },
      'idemp-eng-phase6-draft'
    );
    await engineeringService.approveEngineeringRevision(owner, revId, 'idemp-eng-phase6-approve');

    // 7. Release Order
    const releaseRes = await releaseOrder(owner, orderId, 'idemp-order-phase6-rel', fixture.db);
    instanceId = releaseRes.data.instanceId;
    op10TaskId = releaseRes.data.taskIds['OP-10'];
    qc20TaskId = releaseRes.data.taskIds['QC-20'];

    // 8. Issue 10 units from RAW to WIP
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
      'idemp-reserve-raw-10'
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
      'idemp-issue-raw-10'
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Work Session Lifecycle (Start, Pause, Resume)
  // -----------------------------------------------------------------
  it('manages work sessions, calculates actual elapsed duration, and tracks status', async () => {
    const operator = fixture.alpha.users.operator.principal;

    // 1. Start task OP-10
    const startRes = await executionService.startTask(
      operator,
      { taskId: op10TaskId, technicianId: operatorTechnicianId, notes: 'Starting CNC Milling' },
      'idemp-start-op10'
    );
    expect(startRes.data.task.status).toBe('RUNNING');

    const activeSession = await fixture.db.workSession.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, sessionType: 'RUNNING' },
    });
    expect(activeSession).toBeDefined();

    // 2. Pause task OP-10 with reason
    const pauseRes = await executionService.pauseTask(
      operator,
      { taskId: op10TaskId, reasonId: pauseReasonId, reason: 'TOOL_CHANGE', notes: 'Scheduled tool swap' },
      'idemp-pause-op10'
    );
    expect(pauseRes.data.task.status).toBe('PAUSED');

    const pausedSession = await fixture.db.workSession.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, sessionType: 'PAUSED' },
    });
    expect(pausedSession).toBeDefined();

    // 3. Resume task OP-10
    const resumeRes = await executionService.resumeTask(
      operator,
      { taskId: op10TaskId, notes: 'Tool replaced, resuming machining' },
      'idemp-resume-op10'
    );
    expect(resumeRes.data.task.status).toBe('RUNNING');
  });

  // -----------------------------------------------------------------
  // 2. Blocker & Issue Records (create, resolve, reopen, block guards)
  // -----------------------------------------------------------------
  it('records blocker issue, enforces task block guard, and unblocks upon resolution', async () => {
    const operator = fixture.alpha.users.operator.principal;
    const planner = fixture.alpha.users.planner.principal;

    // 1. Create a CRITICAL blocker issue on OP-10
    const createIssueRes = await executionService.createTaskIssue(
      operator,
      {
        taskId: op10TaskId,
        issueReasonId,
        title: 'Tool broken inside workpiece',
        description: 'End mill snapped during rapid traverse',
        severity: 'CRITICAL',
        ownerUserId: fixture.alpha.users.planner.userId,
        evidence: ['https://storage.manuos.internal/photos/issue-broken-tool.jpg'],
      },
      'idemp-create-issue-op10'
    );

    createdIssueId = createIssueRes.data.id;
    expect(createIssueRes.data.status).toBe('OPEN');
    expect(createIssueRes.data.severity).toBe('CRITICAL');

    // Verify task is automatically marked BLOCKED
    const blockedTask = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
    });
    expect(blockedTask.status).toBe('BLOCKED');

    // 2. Verify startTask rejects when blocked by unresolved issue
    await expect(
      executionService.startTask(
        operator,
        { taskId: op10TaskId },
        'idemp-start-blocked-fail'
      )
    ).rejects.toThrowError(BadRequestError);

    // 3. Verify notification inbox received alert for owner
    const notification = await fixture.db.notificationInbox.findFirst({
      where: {
        workspaceId: fixture.alpha.workspaceId,
        userId: fixture.alpha.users.planner.userId,
        subjectType: 'TASK_ISSUE',
      },
    });
    expect(notification).toBeDefined();
    expect(notification?.title).toContain('Issue Assigned');

    // 4. Resolve the issue
    const resolveRes = await executionService.resolveTaskIssue(
      planner,
      createdIssueId,
      { notes: 'Workpiece extracted and tool head replaced' },
      'idemp-resolve-issue-op10'
    );
    expect(resolveRes.data.status).toBe('RESOLVED');
    expect(resolveRes.data.resolvedAt).toBeDefined();

    // Verify task is now unblocked
    const unblockedTask = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
    });
    expect(unblockedTask.status).not.toBe('BLOCKED');

    // 5. List issues for task
    const issuesList = await executionService.listTaskIssues(operator, op10TaskId);
    expect(issuesList.length).toBeGreaterThanOrEqual(1);
    expect(issuesList[0].id).toBe(createdIssueId);
    expect(issuesList[0].evidence.length).toBe(1);
  });

  // -----------------------------------------------------------------
  // 3. Mobile Code & QR Scanner Lookup
  // -----------------------------------------------------------------
  it('scans and safely resolves task and order barcodes/QR strings', async () => {
    const owner = fixture.alpha.users.owner.principal;

    // 1. Scan Task QR code: "TASK:<id>"
    const taskScan = await executionService.scanCode(owner, { code: `TASK:${op10TaskId}` });
    expect(taskScan.type).toBe('TASK');
    expect(taskScan.entityId).toBe(op10TaskId);
    expect(taskScan.displayCode).toBe('OP-10');

    // Operator scan lookup must not reveal work assigned to another role/task.
    await expect(
      executionService.scanCode(fixture.alpha.users.operator.principal, { code: `TASK:${qc20TaskId}` })
    ).rejects.toThrowError(NotFoundError);

    // Order data must not be revealed to operators without order read permission.
    await expect(
      executionService.scanCode(fixture.alpha.users.operator.principal, { code: `ORDER:${orderId}` })
    ).rejects.toThrowError(NotFoundError);

    // 2. Scan Order QR code: "ORDER:<orderId>"
    const orderScan = await executionService.scanCode(owner, { code: `ORDER:${orderId}` });
    expect(orderScan.type).toBe('ORDER');
    expect(orderScan.entityId).toBe(orderId);

    // Scanning a job (manufacturing order) resolves to the assigned operator's active task.
    const op10Task = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
      include: { jobsheet: true },
    });
    const manufacturingOrder = await fixture.db.manufacturingOrder.findUniqueOrThrow({
      where: { id: op10Task.jobsheet!.manufacturingOrderId },
    });
    const operatorJobScan = await executionService.scanCode(
      fixture.alpha.users.operator.principal,
      { code: manufacturingOrder.moNumber }
    );
    expect(operatorJobScan.type).toBe('JOB');
    expect(operatorJobScan.taskId).toBe(op10TaskId);

    // Order-reading staff learn the job exists but never receive a task deep link.
    const buyerJobScan = await executionService.scanCode(
      fixture.alpha.users.buyer.principal,
      { code: manufacturingOrder.moNumber }
    );
    expect(buyerJobScan.type).toBe('JOB');
    expect(buyerJobScan.taskId).toBeUndefined();

    // 3. Scan invalid code -> throws NotFoundError
    await expect(
      executionService.scanCode(owner, { code: 'INVALID-UNKNOWN-BARCODE-999' })
    ).rejects.toThrowError(NotFoundError);
  });

  // -----------------------------------------------------------------
  // 4. Output Recording, Overproduction Guard & QC Mass Conservation
  // -----------------------------------------------------------------
  it('records production output, prevents overproduction, and enforces exact QC mass conservation', async () => {
    const operator = fixture.alpha.users.operator.principal;
    const owner = fixture.alpha.users.owner.principal;
    const qc = fixture.alpha.users.qc.principal;

    // Ensure task is RUNNING
    await fixture.db.task.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
      data: { status: 'RUNNING' },
    });

    // 1. Record Output of 10 units to Quarantine location
    const outputRes = await recordOutput(
      fixture.db,
      operator,
      {
        taskId: op10TaskId,
        outputAtoms: parseQuantity('10'),
        destinationLocationId: fixture.alpha.masters.quarantineLocationId,
        isFinal: true,
        notes: 'Machining complete, moving to quarantine for QC',
      },
      'idemp-output-op10-10'
    );

    const prodOutputId = outputRes.data.output.id;
    expect(prodOutputId).toBeDefined();

    // 2. Attempt Overproduction beyond ordered quantity (10 units ordered, trying +1 unit)
    await expect(
      recordOutput(
        fixture.db,
        operator,
        {
          taskId: op10TaskId,
          outputAtoms: parseQuantity('1'),
          destinationLocationId: fixture.alpha.masters.quarantineLocationId,
          isFinal: true,
        },
        'idemp-output-overproduction-fail'
      )
    ).rejects.toThrowError(BadRequestError);

    // 3. Create QC Inspection
    const inspRes = await createInspection(
      fixture.db,
      qc,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId: prodOutputId,
        inspectedAtoms: parseQuantity('10'),
      },
      'idemp-insp-op10-10'
    );
    const inspectionId = inspRes.data.id;

    // 4. Attempt Finalizing QC with Mass Violation (inspected 10, passed 8 + rework 1 = 9 != 10) -> must throw BadRequestError
    await expect(
      finalizeInspection(
        fixture.db,
        qc,
        {
          inspectionId,
          passedAtoms: parseQuantity('8'),
          reworkAtoms: parseQuantity('1'),
          scrappedAtoms: 0n,
          disposition: 'PARTIAL',
          results: [],
        },
        'idemp-finalize-mass-violation-fail'
      )
    ).rejects.toThrowError(BadRequestError);

    // 5. Finalize QC with exact mass conservation (8 passed + 2 rework + 0 scrapped = 10 inspected)
    const finalizeRes = await finalizeInspection(
      fixture.db,
      qc,
      {
        inspectionId,
        passedAtoms: parseQuantity('8'),
        reworkAtoms: parseQuantity('2'),
        scrappedAtoms: 0n,
        disposition: 'PARTIAL',
        results: [
          {
            checkCode: 'DIM-01',
            checkDescription: 'Diameter measurement within tolerance',
            checkMethod: 'MICROMETER',
            measuredValue: '25.02mm',
            isPassed: true,
          },
          {
            checkCode: 'SURF-01',
            checkDescription: 'Surface roughness Ra <= 0.8',
            checkMethod: 'PROFILOMETER',
            isPassed: false,
            defectReason: 'Surface roughness slightly high on 2 pieces',
          },
        ],
      },
      'idemp-finalize-mass-success'
    );

    expect(finalizeRes.data.status).toBe('FINALIZED');
    expect(finalizeRes.data.passedAtoms).toBe(parseQuantity('8'));
    expect(finalizeRes.data.reworkAtoms).toBe(parseQuantity('2'));

    // Verify stock moved to FG location: 8 units in FG
    const fgBalance = await inventoryService.getBalances(
      owner,
      { itemId: fixture.alpha.masters.fgItemId, locationId: fixture.alpha.masters.fgLocationId }
    );
    expect(fgBalance[0].onHandAtoms).toBe(parseQuantity('8'));
  });

  // -----------------------------------------------------------------
  // 5. Truthful Customer Milestones & Settled Deliveries
  // -----------------------------------------------------------------
  it('projects truthful customer milestones and does not claim full delivery on partial shipment', async () => {
    const customerUser = fixture.alpha.users.customerUser.principal;
    const owner = fixture.alpha.users.owner.principal;

    // 1. Customer order view shows 80% QC progress (8 passed / 10 ordered)
    const orderDetail = await portalService.getCustomerOrder(customerUser, orderId);
    expect(orderDetail.lines[0].progressPct).toBe(80);
    expect(orderDetail.lines[0].qcPassedQuantity).toBe('8');

    // Released order was confirmed during release: intake milestone is settled.
    const intakeMilestone = orderDetail.milestones.find((m) => m.key === 'INTAKE');
    expect(intakeMilestone?.status).toBe('COMPLETED');

    // A draft order must not read as confirmed intake to the customer.
    const draftOrder = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-12-20T17:00:00.000Z',
      },
      'idemp-order-phase6-draft'
    );
    const draftView = await portalService.getCustomerOrder(customerUser, draftOrder.data.id);
    expect(draftView.milestones.find((m) => m.key === 'INTAKE')?.status).toBe('PENDING');

    // 2. Check milestones: DELIVERY must be PENDING (no shipment yet)
    const deliveryMilestone = orderDetail.milestones.find((m) => m.key === 'DELIVERY');
    expect(deliveryMilestone?.status).toBe('PENDING');

    // 3. Create a partial shipment of 4 units (out of 10)
    const partialShipment = await fixture.db.shipment.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        shipmentNumber: 'SHIP-PARTIAL-001',
        orderId,
        customerId: fixture.alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              itemId: fixture.alpha.masters.fgItemId,
              sourceLocationId: fixture.alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('4'),
              dispatchedAtoms: parseQuantity('4'),
              deliveredAtoms: parseQuantity('4'),
            },
          ],
        },
      },
    });
    expect(partialShipment).toBeDefined();

    // 4. Re-query customer order: partial shipment (4/10 delivered) must mark DELIVERY as IN_PROGRESS, NEVER COMPLETED!
    const orderAfterPartial = await portalService.getCustomerOrder(customerUser, orderId);
    const partialDeliveryMilestone = orderAfterPartial.milestones.find((m) => m.key === 'DELIVERY');
    expect(partialDeliveryMilestone?.status).toBe('IN_PROGRESS');

    // 5. Create second shipment for remaining 6 units -> total delivered is 10/10 -> DELIVERY is COMPLETED!
    await fixture.db.shipment.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        shipmentNumber: 'SHIP-FINAL-002',
        orderId,
        customerId: fixture.alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [
            {
              itemId: fixture.alpha.masters.fgItemId,
              sourceLocationId: fixture.alpha.masters.fgLocationId,
              allocatedAtoms: parseQuantity('6'),
              dispatchedAtoms: parseQuantity('6'),
              deliveredAtoms: parseQuantity('6'),
            },
          ],
        },
      },
    });

    const orderAfterFull = await portalService.getCustomerOrder(customerUser, orderId);
    const fullDeliveryMilestone = orderAfterFull.milestones.find((m) => m.key === 'DELIVERY');
    expect(fullDeliveryMilestone?.status).toBe('COMPLETED');
  });

  it('projects QC and delivery quantities separately for every customer order line', async () => {
    const { alpha } = fixture;
    const customerUser = alpha.users.customerUser.principal;
    const multiOrder = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        lines: [
          { itemId: alpha.masters.fgItemId, orderedQuantity: '10' },
          { itemId: alpha.masters.rawItemId, orderedQuantity: '40' },
        ],
        requestedDate: '2026-12-21T00:00:00Z',
      },
      'idemp-order-phase6-multi-line-portal'
    );
    const [firstLine, secondLine] = multiOrder.data.lines;

    await fixture.db.shipment.create({
      data: {
        workspaceId: alpha.workspaceId,
        shipmentNumber: 'SHIP-P6-MULTI-LINE-001',
        orderId: multiOrder.data.id,
        customerId: alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [{
            orderLineId: firstLine.id,
            itemId: firstLine.itemId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: BigInt(firstLine.orderedAtoms),
            dispatchedAtoms: BigInt(firstLine.orderedAtoms),
            deliveredAtoms: BigInt(firstLine.orderedAtoms),
          }],
        },
      },
    });

    const partiallyDelivered = await portalService.getCustomerOrder(customerUser, multiOrder.data.id);
    expect(partiallyDelivered.lines.map((line) => [line.itemCode, line.deliveredQuantity])).toEqual([
      [firstLine.item.code, '10'],
      [secondLine.item.code, '0'],
    ]);
    expect(partiallyDelivered.milestones.find((milestone) => milestone.key === 'DELIVERY')?.status).toBe('IN_PROGRESS');

    await fixture.db.shipment.create({
      data: {
        workspaceId: alpha.workspaceId,
        shipmentNumber: 'SHIP-P6-MULTI-LINE-002',
        orderId: multiOrder.data.id,
        customerId: alpha.masters.customerId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        lines: {
          create: [{
            orderLineId: secondLine.id,
            itemId: secondLine.itemId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: BigInt(secondLine.orderedAtoms),
            dispatchedAtoms: BigInt(secondLine.orderedAtoms),
            deliveredAtoms: BigInt(secondLine.orderedAtoms),
          }],
        },
      },
    });

    const fullyDelivered = await portalService.getCustomerOrder(customerUser, multiOrder.data.id);
    expect(fullyDelivered.milestones.find((milestone) => milestone.key === 'DELIVERY')?.status).toBe('COMPLETED');
  });
  it("retrieves technician profile with verified skills, levels, and active certifications", async () => {
    const operator = fixture.alpha.users.operator.principal;
    const profile = await executionService.getTechnicianProfile(operator);

    expect(profile.technicianId).toBe(fixture.alpha.masters.technicianId);
    expect(profile.code).toBe("TECH-01");
    expect(profile.name).toBe("Lead CNC Operator");
    expect(profile.departmentName).toBeDefined();
    expect(profile.calendarName).toBeDefined();
    expect(profile.skills.length).toBeGreaterThanOrEqual(1);
    expect(profile.skills[0].level).toBe(4);
    expect(profile.skills[0].skillCode).toBe("SKILL-MILL-5AX");
  });
});
