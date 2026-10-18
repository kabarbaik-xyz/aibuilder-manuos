import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { releaseOrder } from '@/server/modules/orders/release';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { PlanningService } from '@/server/modules/planning/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { MastersService } from '@/server/modules/masters/service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { recordOutput } from '@/server/modules/execution/output';
import { FormService } from '@/server/modules/forms/service';

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
    const mastersService = new MastersService(fixture.db);
    await fixture.db.issueReason.create({
      data: {
        workspaceId: alpha.workspaceId,
        category: 'PAUSE',
        code: 'BREAK',
        label: 'Shift break',
        isActive: true,
      },
    });
    await mastersService.publishRosterIntervals(alpha.users.owner.principal, {
      intervals: [
        ...[
          ['2026-10-16T08:00:00.000Z', '2026-10-16T10:00:00.000Z'],
          ['2026-10-16T13:00:00.000Z', '2026-10-16T16:00:00.000Z'],
          ['2030-01-02T08:00:00.000Z', '2030-01-02T09:00:00.000Z'],
        ].flatMap(([startAt, endAt]) => [
          { technicianId: alpha.masters.technicianId, intervalType: 'SHIFT' as const, startAt, endAt },
          { machineId: alpha.masters.machineId, intervalType: 'SHIFT' as const, startAt, endAt },
        ]),
      ],
    }, 'idemp-task-execution-roster');

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

    const forms = new FormService(fixture.db);
    const taskEvidence = await forms.createTemplate(alpha.users.owner.principal, {
      code: `TASK_EVIDENCE_${randomUUID().slice(0, 8)}`,
      name: 'Task execution evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(alpha.users.owner.principal, {
      templateId: taskEvidence.templateId,
      versionId: taskEvidence.versionId,
      expectedVersion: 1,
    });
    const taskBinding = await forms.bindFormVersion(alpha.users.owner.principal, {
      formVersionId: taskEvidence.versionId,
      context: 'WORKFLOW_NODE',
      workflowVersionId: wfV1Id,
      workflowNodeKey: 'OP-10',
      required: false,
      completionPoint: 'BEFORE_ACTION',
    }, 'task-execution-form-binding');

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
    const releaseRes = await releaseOrder(
      alpha.users.owner.principal,
      orderId,
      'key-order-release-m3',
      fixture.db
    );
    instanceId = releaseRes.data.instanceId;
    op10TaskId = releaseRes.data.taskIds['OP-10'];
    qc20TaskId = releaseRes.data.taskIds['QC-20'];
    const pinnedTaskForms = await fixture.db.formInstance.findMany({ where: { subjectType: 'TASK', subjectId: op10TaskId } });
    expect(pinnedTaskForms)
      .toMatchObject([{ formVersionId: taskEvidence.versionId, formBindingId: taskBinding.bindingId, required: false, completionPoint: 'BEFORE_ACTION' }]);

    const v2 = await workflowService.forkVersion(alpha.users.owner.principal, wfV1Id, 'task-execution-form-v2-fork');
    const additionalEvidence = await forms.createTemplate(alpha.users.owner.principal, {
      code: `TASK_EVIDENCE_V2_${randomUUID().slice(0, 8)}`,
      name: 'Additional task evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(alpha.users.owner.principal, {
      templateId: additionalEvidence.templateId,
      versionId: additionalEvidence.versionId,
      expectedVersion: 1,
    });
    await forms.bindFormVersion(alpha.users.owner.principal, {
      formVersionId: additionalEvidence.versionId,
      context: 'WORKFLOW_NODE',
      workflowVersionId: v2.data.id,
      workflowNodeKey: 'OP-10',
      required: true,
      completionPoint: 'BEFORE_STAGE_COMPLETION',
    }, 'task-execution-form-v2-binding');
    await workflowService.publishVersion(alpha.users.owner.principal, v2.data.id, 'task-execution-form-v2-publish');
    expect(await fixture.db.formInstance.findMany({ where: { subjectType: 'TASK', subjectId: op10TaskId } }))
      .toEqual(pinnedTaskForms);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('denies execution reads, writes, issues, and scan across facilities even for supervisors', async () => {
    const { alpha } = fixture;
    const otherSite = await fixture.db.facility.create({ data: { workspaceId: alpha.workspaceId, code: 'OTHER-SITE', name: 'Other site' } });
    const owner = alpha.users.owner.principal;
    const restricted = { ...alpha.users.planner.principal, facilityId: otherSite.id, facilityIds: [otherSite.id] };
    const ungranted = { ...alpha.users.planner.principal, facilityId: null, facilityIds: [] };
    expect((await executionService.getTaskExecutionDetail(owner, op10TaskId)).id).toBe(op10TaskId);
    for (const principal of [restricted, ungranted]) {
      expect(await executionService.getMyTasks(principal)).toEqual([]);
      await expect(executionService.getTaskExecutionDetail(principal, op10TaskId)).rejects.toThrow(NotFoundError);
      for (const method of ['startTask', 'pauseTask', 'resumeTask'] as const) {
        await expect(executionService[method](principal, { taskId: op10TaskId })).rejects.toThrow(NotFoundError);
      }
      await expect(recordOutput(fixture.db, principal, { taskId: op10TaskId, outputAtoms: '1000000', destinationLocationId: alpha.masters.rawLocationId })).rejects.toThrow(NotFoundError);
      await expect(executionService.createTaskIssue(principal, { taskId: op10TaskId, title: 'Unauthorized issue' })).rejects.toThrow(NotFoundError);
      expect(await executionService.listTaskIssues(principal, op10TaskId)).toEqual([]);
      await expect(executionService.scanCode(principal, { code: `TASK:${op10TaskId}` })).rejects.toThrow(NotFoundError);
      await expect(executionService.scanCode(principal, { code: `ORDER:${orderId}` })).rejects.toThrow(NotFoundError);
    }
    expect(await fixture.db.productionOutput.count({ where: { taskId: op10TaskId } })).toBe(0);
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
      scheduledStartAt: '2026-10-16T08:00:00.000Z',
      scheduledEndAt: '2026-10-16T10:00:00.000Z',
    });
    expect(res2.isEligible).toBe(true);
    expect(res2.violations).toHaveLength(0);

    const missingRequiredResources = await planningService.evaluateAssignment(
      alpha.users.planner.principal,
      { taskId: op10TaskId }
    );
    expect(missingRequiredResources.isEligible).toBe(false);
    expect(missingRequiredResources.violations.join(' ')).toMatch(/require a technician/);
    expect(missingRequiredResources.violations.join(' ')).toMatch(/require a machine/);
  });

  it('requires planning permission and rejects invalid assignment windows', async () => {
    const { alpha } = fixture;

    await expect(
      planningService.evaluateAssignment(alpha.users.operator.principal, {
        taskId: op10TaskId,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      planningService.evaluateAssignment(alpha.users.buyer.principal, {
        taskId: op10TaskId,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      planningService.evaluateAssignment(alpha.users.planner.principal, {
        taskId: op10TaskId,
        scheduledStartAt: '2026-10-16T10:00:00.000Z',
        scheduledEndAt: '2026-10-16T10:00:00.000Z',
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('assigns qualified technician and machine, creating resource bookings', async () => {
    const { alpha } = fixture;

    const assignRes = await planningService.assignTask(
      alpha.users.planner.principal,
      {
        taskId: op10TaskId,
        technicianId: alpha.masters.technicianId,
        machineId: alpha.masters.machineId,
        expectedVersion: 1,
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
        expectedVersion: 2,
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

    await expect(
      planningService.assignTask(
        alpha.users.planner.principal,
        {
          taskId: op10TaskId,
          technicianId: alpha.masters.technicianId,
          machineId: alpha.masters.machineId,
          expectedVersion: 1,
        },
        'cmd-assign-op10-stale-version'
      )
    ).rejects.toThrow(ConflictError);
  });

  it('rejects overlapping confirmed bookings and preserves assignment booking agreement on partial updates', async () => {
    const { alpha } = fixture;
    const overlapStart = '2026-10-16T14:00:00.000Z';
    const overlapEnd = '2026-10-16T15:00:00.000Z';
    const unblockedTask = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId,
        nodeKey: 'INDEPENDENT-OVERLAP-CHECK',
        plannedDurationMinutes: 60,
      },
    });

    const partialUpdate = await planningService.assignTask(
      alpha.users.planner.principal,
      {
        taskId: op10TaskId,
        technicianId: alpha.masters.technicianId,
        expectedVersion: 3,
        startAt: '2026-10-16T14:00:00.000Z',
        endAt: '2026-10-16T16:00:00.000Z',
      },
      'cmd-assign-op10-partial'
    );
    expect((partialUpdate.data as any).task.assignedMachineId).toBe(alpha.masters.machineId);

    const confirmed = await fixture.db.resourceBooking.findMany({
      where: { taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(confirmed.map((booking) => booking.resourceType).sort()).toEqual([
      'MACHINE',
      'TECHNICIAN',
    ]);
    expect(
      confirmed.every((booking) => booking.startAt.toISOString() === '2026-10-16T14:00:00.000Z')
    ).toBe(true);

    await planningService.assignTask(
      alpha.users.planner.principal,
      {
        taskId: op10TaskId,
        technicianId: alpha.masters.technicianId,
        expectedVersion: 4,
      },
      'cmd-assign-op10-preserve-window'
    );
    const preservedWindowBookings = await fixture.db.resourceBooking.findMany({
      where: { taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(
      preservedWindowBookings.every(
        (booking) =>
          booking.startAt.toISOString() === '2026-10-16T14:00:00.000Z' &&
          booking.endAt.toISOString() === '2026-10-16T16:00:00.000Z'
      )
    ).toBe(true);

    const evaluation = await planningService.evaluateAssignment(alpha.users.planner.principal, {
      taskId: unblockedTask.id,
      technicianId: alpha.masters.technicianId,
      scheduledStartAt: overlapStart,
      scheduledEndAt: overlapEnd,
    });
    expect(evaluation.isEligible).toBe(false);
    expect(
      evaluation.violations.some((violation) => violation.includes('overlapping booking'))
    ).toBe(true);

    await expect(
      planningService.assignTask(
        alpha.users.planner.principal,
        {
          taskId: unblockedTask.id,
          technicianId: alpha.masters.technicianId,
          expectedVersion: 1,
          startAt: overlapStart,
          endAt: overlapEnd,
        },
        'cmd-assign-qc20-overlap'
      )
    ).rejects.toThrow(BadRequestError);

    const taskAfterRejection = await fixture.db.task.findUnique({
      where: { id: unblockedTask.id },
    });
    expect(taskAfterRejection?.assignedTechnicianId).toBeNull();
    expect(
      await fixture.db.resourceBooking.count({
        where: { taskId: unblockedTask.id, status: 'CONFIRMED' },
      })
    ).toBe(0);
  });

  it('enforces booking interval and resource overlap triggers for inserts and updates', async () => {
    const { alpha } = fixture;
    const triggers = await fixture.db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'resource_bookings_%'"
    );
    expect(triggers.map((trigger) => trigger.name).sort()).toEqual([
      'resource_bookings_prevent_overlap_insert',
      'resource_bookings_prevent_overlap_update',
      'resource_bookings_validate_interval_insert',
      'resource_bookings_validate_interval_update',
    ]);
    const taskA = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId,
        nodeKey: 'TRIGGER-BOOKING-A',
        plannedDurationMinutes: 60,
      },
    });
    const taskB = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId,
        nodeKey: 'TRIGGER-BOOKING-B',
        plannedDurationMinutes: 60,
      },
    });
    const startAt = new Date('2030-01-01T08:00:00.000Z');
    const endAt = new Date('2030-01-01T09:00:00.000Z');
    const firstBooking = await fixture.db.resourceBooking.create({
      data: {
        workspaceId: alpha.workspaceId,
        resourceType: 'TECHNICIAN',
        resourceId: alpha.masters.technicianId,
        taskId: taskA.id,
        startAt,
        endAt,
      },
    });

    await expect(
      fixture.db.resourceBooking.create({
        data: {
          workspaceId: alpha.workspaceId,
          resourceType: 'TECHNICIAN',
          resourceId: alpha.masters.technicianId,
          taskId: taskB.id,
          startAt: new Date('2030-01-01T08:30:00.000Z'),
          endAt: new Date('2030-01-01T09:30:00.000Z'),
        },
      })
    ).rejects.toThrow();

    const cancelledBooking = await fixture.db.resourceBooking.create({
      data: {
        workspaceId: alpha.workspaceId,
        resourceType: 'TECHNICIAN',
        resourceId: alpha.masters.technicianId,
        taskId: taskB.id,
        startAt: new Date('2030-01-01T08:30:00.000Z'),
        endAt: new Date('2030-01-01T09:30:00.000Z'),
        status: 'CANCELLED',
      },
    });
    await expect(
      fixture.db.resourceBooking.update({
        where: { id: cancelledBooking.id },
        data: { status: 'CONFIRMED' },
      })
    ).rejects.toThrow();
    await expect(
      fixture.db.resourceBooking.update({
        where: { id: cancelledBooking.id },
        data: { startAt: endAt, endAt: startAt },
      })
    ).rejects.toThrow();
    await expect(
      fixture.db.resourceBooking.create({
        data: {
          workspaceId: alpha.workspaceId,
          resourceType: 'MACHINE',
          resourceId: alpha.masters.machineId,
          taskId: taskB.id,
          startAt: endAt,
          endAt: startAt,
        },
      })
    ).rejects.toThrow();
    expect(firstBooking.status).toBe('CONFIRMED');
  });

  it('rejects silent normalization of inconsistent legacy booking windows', async () => {
    const { alpha } = fixture;
    const legacyTask = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId,
        nodeKey: 'INCONSISTENT-LEGACY-WINDOWS',
        plannedDurationMinutes: 60,
        assignedTechnicianId: alpha.masters.technicianId,
        assignedMachineId: alpha.masters.machineId,
      },
    });
    await fixture.db.resourceBooking.createMany({
      data: [
        {
          workspaceId: alpha.workspaceId,
          resourceType: 'TECHNICIAN',
          resourceId: alpha.masters.technicianId,
          taskId: legacyTask.id,
          startAt: new Date('2031-01-01T08:00:00.000Z'),
          endAt: new Date('2031-01-01T09:00:00.000Z'),
        },
        {
          workspaceId: alpha.workspaceId,
          resourceType: 'MACHINE',
          resourceId: alpha.masters.machineId,
          taskId: legacyTask.id,
          startAt: new Date('2031-01-01T09:00:00.000Z'),
          endAt: new Date('2031-01-01T10:00:00.000Z'),
        },
      ],
    });
    await expect(
      planningService.assignTask(
        alpha.users.planner.principal,
        {
          taskId: legacyTask.id,
          expectedVersion: 1,
          technicianId: alpha.masters.technicianId,
        },
        'cmd-assign-inconsistent-legacy-windows'
      )
    ).rejects.toThrow(ConflictError);
  });

  it('rejects assignment when predecessors are incomplete and handles concurrent resource claims', async () => {
    const { alpha } = fixture;
    await expect(
      planningService.assignTask(
        alpha.users.planner.principal,
        {
          taskId: qc20TaskId,
          technicianId: alpha.masters.technicianId,
          expectedVersion: 1,
        },
        'cmd-assign-qc-before-predecessor'
      )
    ).rejects.toThrow(BadRequestError);

    const runningTask = await fixture.db.task.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId,
        nodeKey: 'NON-ASSIGNABLE-RUNNING',
        plannedDurationMinutes: 60,
        status: 'RUNNING',
      },
    });
    await expect(
      planningService.assignTask(
        alpha.users.planner.principal,
        {
          taskId: runningTask.id,
          technicianId: alpha.masters.technicianId,
          expectedVersion: 1,
        },
        'cmd-assign-running-task'
      )
    ).rejects.toThrow(BadRequestError);

    const concurrentTasks = await Promise.all(
      ['CONCURRENT-CLAIM-A', 'CONCURRENT-CLAIM-B'].map((nodeKey) =>
        fixture.db.task.create({
          data: {
            workspaceId: alpha.workspaceId,
            instanceId,
            nodeKey,
            plannedDurationMinutes: 60,
          },
        })
      )
    );
    const attempts = await Promise.allSettled(
      concurrentTasks.map((task) =>
        planningService.assignTask(
          alpha.users.planner.principal,
          {
            taskId: task.id,
            technicianId: alpha.masters.technicianId,
            expectedVersion: task.version,
            startAt: '2030-01-02T08:00:00.000Z',
            endAt: '2030-01-02T09:00:00.000Z',
          },
          `cmd-concurrent-${task.id}`
        )
      )
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await fixture.db.resourceBooking.count({
        where: {
          resourceType: 'TECHNICIAN',
          resourceId: alpha.masters.technicianId,
          status: 'CONFIRMED',
          startAt: new Date('2030-01-02T08:00:00.000Z'),
        },
      })
    ).toBe(1);
  });

  it('rejects starting task when predecessor task is not completed', async () => {
    const { alpha } = fixture;

    // Attempting to start QC-20 before OP-10 completes must be rejected
    await expect(
      executionService.startTask(
        alpha.users.planner.principal,
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

  it('rejects starting task when material coverage is partial', async () => {
    const { alpha } = fixture;

    // Only half of the required 20 units is available in the warehouse.
    await inventoryService.postOpeningBalance(
      alpha.users.owner.principal,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-PARTIAL',
        atoms: 10000000n, // 10 units
      },
      'cmd-opening-raw-partial'
    );

    await expect(
      executionService.startTask(
        alpha.users.operator.principal,
        { taskId: op10TaskId },
        'cmd-start-op10-partial'
      )
    ).rejects.toThrow(/lack full coverage/);
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
