import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { releaseOrder } from '@/server/modules/orders/release';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { PlanningService } from '@/server/modules/planning/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { BadRequestError, ForbiddenError } from '@/domain/errors';

describe('O05: Actual Planning, Assignment, and Operator Work Sessions', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let planningService: PlanningService;
  let executionService: ExecutionService;
  let inventoryService: InventoryService;

  let orderId: string;
  let instanceId: string;
  let op10TaskId: string;
  let qc20TaskId: string;
  let wfV1Id: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    planningService = new PlanningService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    inventoryService = new InventoryService(fixture.db);

    const { alpha } = fixture;

    // 1. Create Workflow Template with OP-10 (machining) and QC-20 (inspection)
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-BRACKET-M3',
        name: 'Bracket Machining & Inspection',
      },
      'key-wf-bracket-tmpl'
    );

    // Save and publish Version 1
    const draftV1 = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Bracket Route V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'CNC 5-Axis Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 120,
              requirements: {
                machineClassId: alpha.masters.machineClassId,
                requiredSkills: [
                  {
                    skillId: alpha.masters.skillId,
                    minLevel: 3,
                  },
                ],
              },
            },
            {
              key: 'QC-20',
              name: 'Final Inspection',
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
      'key-wf-draft-v1'
    );
    wfV1Id = draftV1.data.id;

    await workflowService.submitReview(alpha.users.owner.principal, wfV1Id, 'key-wf-rev-v1');
    await workflowService.publishVersion(alpha.users.owner.principal, wfV1Id, 'key-wf-pub-v1');

    // 2. Create Order
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T17:00:00.000Z',
      },
      'key-order-m3-01'
    );
    orderId = orderRes.data.id;

    // 3. Configure and Approve Engineering Revision with BOM
    const revId = orderRes.data.engineeringRevisions[0].id;
    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revId,
      {
        workflowVersionId: wfV1Id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 2,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'key-eng-m3-save'
    );
    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revId,
      'key-eng-m3-approve'
    );

    // 4. Release Order to generate tasks and material demands
    const releaseRes = await releaseOrder(alpha.users.owner.principal, orderId, 'key-order-release-m3', fixture.db);
    instanceId = releaseRes.data.instanceId;
    op10TaskId = releaseRes.data.taskIds['OP-10'];
    qc20TaskId = releaseRes.data.taskIds['QC-20'];
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('evaluates assignment eligibility and rejects unqualified resources', async () => {
    const { alpha } = fixture;

    // 1. Evaluate with nonexistent technician
    const res1 = await planningService.evaluateAssignment(alpha.users.planner.principal, {
      taskId: op10TaskId,
      technicianId: 'non-existent-tech-id',
    });
    expect(res1.isEligible).toBe(false);
    expect(res1.violations.some((v) => v.includes('not found'))).toBe(true);

    // 2. Evaluate with qualified technician and machine
    const res2 = await planningService.evaluateAssignment(alpha.users.planner.principal, {
      taskId: op10TaskId,
      technicianId: alpha.masters.technicianId,
      machineId: alpha.masters.machineId,
    });
    expect(res2.isEligible).toBe(true);
    expect(res2.violations).toHaveLength(0);
  });

  it('assigns qualified technician and machine, creating resource bookings', async () => {
    const { alpha } = fixture;

    const assignRes = await planningService.assignTask(
      alpha.users.planner.principal,
      {
        taskId: op10TaskId,
        technicianId: alpha.masters.technicianId,
        machineId: alpha.masters.machineId,
        startAt: '2026-10-16T08:00:00.000Z',
        endAt: '2026-10-16T10:00:00.000Z',
      },
      'cmd-assign-op10-01'
    );

    const assignData = assignRes.data as any;
    expect(assignData.task.assignedTechnicianId).toBe(alpha.masters.technicianId);
    expect(assignData.task.assignedMachineId).toBe(alpha.masters.machineId);
    expect(assignData.task.status).toBe('ASSIGNED');
    expect(assignData.bookings).toHaveLength(2);

    // Verify bookings in DB
    const bookings = await fixture.db.resourceBooking.findMany({
      where: { taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(bookings).toHaveLength(2);

    // Reassignment does not duplicate bookings (cancels prior ones)
    const reassignRes = await planningService.assignTask(
      alpha.users.planner.principal,
      {
        taskId: op10TaskId,
        technicianId: alpha.masters.technicianId,
        machineId: alpha.masters.machineId,
        startAt: '2026-10-16T13:00:00.000Z',
        endAt: '2026-10-16T15:00:00.000Z',
      },
      'cmd-assign-op10-02'
    );
    const reassignData = reassignRes.data as any;
    expect(reassignData.bookings).toHaveLength(2);

    const activeBookings = await fixture.db.resourceBooking.findMany({
      where: { taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(activeBookings).toHaveLength(2);

    const cancelledBookings = await fixture.db.resourceBooking.findMany({
      where: { taskId: op10TaskId, status: 'CANCELLED' },
    });
    expect(cancelledBookings).toHaveLength(2);
  });

  it('rejects starting task when predecessor task is not completed', async () => {
    const { alpha } = fixture;

    // Attempting to start QC-20 before OP-10 completes must be rejected
    await expect(
      executionService.startTask(
        alpha.users.operator.principal,
        { taskId: qc20TaskId },
        'cmd-start-qc20-fail'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects starting task when required materials have zero stock available or issued', async () => {
    const { alpha } = fixture;

    // OP-10 requires 20 units of RAW-AL6061-ROD, currently 0 in warehouse and 0 issued
    await expect(
      executionService.startTask(
        alpha.users.operator.principal,
        { taskId: op10TaskId },
        'cmd-start-op10-nomat'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('starts task, transitions status to RUNNING, and records work session', async () => {
    const { alpha } = fixture;

    // 1. Post opening balance of RAW material so material check passes
    await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-001',
        atoms: 50000000n, // 50 units
      },
      'cmd-opening-raw-op'
    );

    // 2. Start Task OP-10
    const startRes = await executionService.startTask(
      alpha.users.operator.principal,
      {
        taskId: op10TaskId,
        notes: 'Tooling calibrated and machine ready',
      },
      'cmd-start-op10-success'
    );

    const startData = startRes.data as any;
    expect(startData.task.status).toBe('RUNNING');
    expect(startData.task.startedAt).toBeTruthy();
    expect(startData.session.sessionType).toBe('RUNNING');
    expect(startData.session.endedAt).toBeNull();

    // Verify Order is now IN_PRODUCTION
    const order = await fixture.db.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('IN_PRODUCTION');

    // Verify WorkSession in DB
    const session = await fixture.db.workSession.findFirst({
      where: { taskId: op10TaskId, endedAt: null },
    });
    expect(session).toBeTruthy();
    expect(session?.sessionType).toBe('RUNNING');
  });

  it('pauses and resumes task, closing sessions and computing duration', async () => {
    const { alpha } = fixture;

    // Advance clock by 30 minutes
    fixture.clock.advance(30 * 60 * 1000);

    // 1. Pause Task
    const pauseRes = await executionService.pauseTask(
      alpha.users.operator.principal,
      {
        taskId: op10TaskId,
        reason: 'BREAK',
        notes: 'Shift break',
      },
      'cmd-pause-op10'
    );

    const pauseData = pauseRes.data as any;
    expect(pauseData.task.status).toBe('PAUSED');
    expect(pauseData.session.sessionType).toBe('PAUSED');
    expect(pauseData.session.endedAt).toBeNull();

    // Verify first session is now ended
    const runningSessions = await fixture.db.workSession.findMany({
      where: { taskId: op10TaskId, sessionType: 'RUNNING' },
    });
    expect(runningSessions).toHaveLength(1);
    expect(runningSessions[0].endedAt).toBeTruthy();
    expect(runningSessions[0].durationMinutes).toBeGreaterThanOrEqual(1);

    // 2. Resume Task
    const resumeRes = await executionService.resumeTask(
      alpha.users.operator.principal,
      {
        taskId: op10TaskId,
        notes: 'Resuming after break',
      },
      'cmd-resume-op10'
    );

    const resumeData = resumeRes.data as any;
    expect(resumeData.task.status).toBe('RUNNING');
    expect(resumeData.session.sessionType).toBe('RUNNING');
    expect(resumeData.session.endedAt).toBeNull();

    // Verify detail read model
    const detail = await executionService.getTaskExecutionDetail(
      alpha.users.operator.principal,
      op10TaskId
    );
    expect(detail.status).toBe('RUNNING');
    expect(detail.sessions.length).toBeGreaterThanOrEqual(2);
    expect(detail.activeSession?.sessionType).toBe('RUNNING');
    expect(detail.currentElapsedMinutes).toBeGreaterThanOrEqual(1);
  });

  it('runs deterministic task scheduling engine', async () => {
    const { alpha } = fixture;

    const schedule = await planningService.scheduleTasks(alpha.users.planner.principal, {
      orderId,
      startHorizon: '2026-10-19T08:00:00.000Z',
    });

    expect(schedule.scheduledTasks.length).toBeGreaterThanOrEqual(2);
    expect(schedule.criticalPath).toContain(op10TaskId);
    expect(schedule.makespanMinutes).toBeGreaterThan(0);
  });
});
