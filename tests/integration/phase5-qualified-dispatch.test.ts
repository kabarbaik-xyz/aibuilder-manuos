import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { PlanningService } from '@/server/modules/planning/service';
import { MastersService } from '@/server/modules/masters/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { BadRequestError, ConflictError } from '@/domain/errors';

describe('Phase 5: Atomic Qualified Manual Dispatch, Eligibility & Readiness', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let planningService: PlanningService;
  let mastersService: MastersService;

  let orderId: string;
  let instanceId: string;
  let op10TaskId: string;
  let qc20TaskId: string;
  let qualifiedTechId: string;
  let unqualifiedTechId: string;
  let testMachineId: string;
  let otherFacilityMachineId: string;
  let facility1Id: string;
  let facility2Id: string;
  let skillId: string;
  let certId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    planningService = new PlanningService(fixture.db);
    mastersService = new MastersService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    skillId = alpha.masters.skillId;

    // 1. Create a mandatory certification
    const cert = await fixture.db.certification.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'CERT-5AXIS-SAFETY',
        name: '5-Axis Safety Certification',
      },
    });
    certId = cert.id;

    // 2. Create primary facility and secondary facility
    const facility1 = await fixture.db.facility.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'FAC-PRIMARY-HQ',
        name: 'Primary HQ Facility',
        timezone: 'Asia/Singapore',
      },
    });
    facility1Id = facility1.id;

    const facility2 = await fixture.db.facility.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'FAC-JURONG-WEST',
        name: 'Jurong West Facility',
        timezone: 'Asia/Singapore',
      },
    });
    facility2Id = facility2.id;

    // 3. Create machine in primary facility and machine in other facility
    testMachineId = alpha.masters.machineId;
    await fixture.db.machine.update({
      where: { id: testMachineId },
      data: { facilityId: facility1Id },
    });

    const otherMach = await mastersService.createMachine(
      owner,
      {
        machineClassId: alpha.masters.machineClassId,
        code: 'CNC-JW-99',
        name: 'Jurong West CNC Machine',
      },
      'idemp-jw-mach'
    );
    otherFacilityMachineId = otherMach.data.id;
    await fixture.db.machine.update({
      where: { id: otherFacilityMachineId },
      data: { facilityId: facility2Id },
    });

    // 4. Create qualified technician with VERIFIED skill level 3 and ACTIVE certification
    const qualTech = await mastersService.createTechnician(
      owner,
      {
        code: 'TECH-QUALIFIED-01',
        name: 'Tan Ah Kow (Qualified)',
      },
      'idemp-tech-qual-01'
    );
    qualifiedTechId = qualTech.data.id;
    await fixture.db.technician.update({
      where: { id: qualifiedTechId },
      data: { facilityId: facility1Id },
    });

    await mastersService.assignSkill(
      owner,
      qualifiedTechId,
      {
        skillId,
        level: 3,
        assessmentStatus: 'VERIFIED',
        evidence: 'AUDIT-VERIFIED-2026',
      },
      'idemp-tech-qual-skill'
    );

    await mastersService.assignCert(
      owner,
      qualifiedTechId,
      {
        certificationId: certId,
        issuedDate: '2026-01-01',
        validUntil: '2028-12-31',
        certificateNumber: 'CERT-QUAL-1234',
      },
      'idemp-tech-qual-cert'
    );

    // 5. Create unqualified technician (skill only CLAIMED, cert expired)
    const unqualTech = await mastersService.createTechnician(
      owner,
      {
        code: 'TECH-UNQUALIFIED-02',
        name: 'Lee Beng Huat (Unqualified)',
      },
      'idemp-tech-unqual-02'
    );
    unqualifiedTechId = unqualTech.data.id;
    await fixture.db.technician.update({
      where: { id: unqualifiedTechId },
      data: { facilityId: facility1Id },
    });

    await mastersService.assignSkill(
      owner,
      unqualifiedTechId,
      {
        skillId,
        level: 3,
        assessmentStatus: 'CLAIMED', // Not verified!
      },
      'idemp-tech-unqual-skill'
    );

    await mastersService.assignCert(
      owner,
      unqualifiedTechId,
      {
        certificationId: certId,
        issuedDate: '2024-01-01',
        validUntil: '2025-01-01', // Expired!
        certificateNumber: 'CERT-EXPIRED-999',
      },
      'idemp-tech-unqual-cert'
    );

    // 6. Workflow Template with OP-10 (requires skill, cert, machine) and QC-20 (inspection)
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-PHASE5-DISPATCH',
        name: 'Phase 5 Dispatch Testing Workflow',
      },
      'idemp-wf-phase5-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Phase 5 Route V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'Precision Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 120,
              requirements: {
                machineClassId: alpha.masters.machineClassId,
                requiredSkills: [{ skillId, minLevel: 3 }],
                requiredCertIds: [certId],
              },
            },
            {
              key: 'QC-20',
              name: 'Final Quality Check',
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
      'idemp-wf-phase5-draft'
    );

    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-phase5-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-phase5-pub');

    // 7. Create Order associated with primary facility
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-11-20T17:00:00.000Z',
        facilityId: facility1Id,
      },
      'idemp-order-phase5-01'
    );
    orderId = orderRes.data.id;

    // 8. Configure Engineering Revision & Release Order
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
      'idemp-eng-phase5-draft'
    );
    await engineeringService.approveEngineeringRevision(owner, revId, 'idemp-eng-phase5-approve');

    const releaseRes = await releaseOrder(owner, orderId, 'idemp-order-phase5-rel', fixture.db);
    instanceId = releaseRes.data.instanceId;
    op10TaskId = releaseRes.data.taskIds['OP-10'];
    qc20TaskId = releaseRes.data.taskIds['QC-20'];
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Unified Eligibility Evaluation Contract
  // -----------------------------------------------------------------
  it('rejects unqualified technician due to unverified skill and expired certification', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const evalResult = await planningService.evaluateAssignment(planner, {
      taskId: op10TaskId,
      technicianId: unqualifiedTechId,
      machineId: testMachineId,
      scheduledStartAt: '2026-11-01T09:00:00.000Z',
      scheduledEndAt: '2026-11-01T11:00:00.000Z',
    });

    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.violations.length).toBeGreaterThanOrEqual(2);
    // Should flag unverified skill
    expect(evalResult.violations.some((v) => v.includes('unverified status') || v.includes('CLAIMED'))).toBe(true);
    // Should flag expired cert
    expect(evalResult.violations.some((v) => v.includes('expired'))).toBe(true);
  });

  it('rejects machine from a different facility without permission grant', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const evalResult = await planningService.evaluateAssignment(planner, {
      taskId: op10TaskId,
      technicianId: qualifiedTechId,
      machineId: otherFacilityMachineId,
      scheduledStartAt: '2026-11-01T09:00:00.000Z',
      scheduledEndAt: '2026-11-01T11:00:00.000Z',
    });

    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.violations.some((v) => v.includes('facility') && v.includes('does not match'))).toBe(true);
  });

  it('rejects machine with scheduled maintenance/downtime overlapping slot', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const planner = fixture.alpha.users.planner.principal;

    // Record machine downtime from 10:00 to 12:00 on Nov 2
    await mastersService.createMachineDowntime(
      owner,
      {
        machineId: testMachineId,
        reason: 'Emergency spindle replacement',
        startAt: '2026-11-02T10:00:00.000Z',
        endAt: '2026-11-02T12:00:00.000Z',
      },
      'idemp-downtime-eval'
    );

    const evalResult = await planningService.evaluateAssignment(planner, {
      taskId: op10TaskId,
      technicianId: qualifiedTechId,
      machineId: testMachineId,
      scheduledStartAt: '2026-11-02T09:30:00.000Z',
      scheduledEndAt: '2026-11-02T11:30:00.000Z',
    });

    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.violations.some((v) => v.includes('scheduled downtime'))).toBe(true);
  });

  it('approves fully qualified technician and available machine', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const evalResult = await planningService.evaluateAssignment(planner, {
      taskId: op10TaskId,
      technicianId: qualifiedTechId,
      machineId: testMachineId,
      scheduledStartAt: '2026-11-03T09:00:00.000Z',
      scheduledEndAt: '2026-11-03T11:00:00.000Z',
    });

    expect(evalResult.isEligible).toBe(true);
    expect(evalResult.violations.length).toBe(0);
    // Unallocated material produces warning advisory, but does not block manual safety eligibility
    expect(evalResult.warnings.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------
  // 2. Atomic Qualified Manual Dispatch (assignTask)
  // -----------------------------------------------------------------
  it('assigns task atomically, creates confirmed bookings, updates status to ASSIGNED, and rejects unqualified assignment', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const taskBefore = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
    });

    // 1. Attempt assigning unqualified technician -> must throw BadRequestError
    await expect(
      planningService.assignTask(
        planner,
        {
          taskId: op10TaskId,
          expectedVersion: taskBefore.version,
          technicianId: unqualifiedTechId,
          machineId: testMachineId,
          startAt: '2026-11-04T09:00:00.000Z',
          endAt: '2026-11-04T11:00:00.000Z',
        },
        'idemp-assign-fail-unqual'
      )
    ).rejects.toThrowError(BadRequestError);

    // 2. Assign qualified technician & machine
    const assignResult = await planningService.assignTask(
      planner,
      {
        taskId: op10TaskId,
        expectedVersion: taskBefore.version,
        technicianId: qualifiedTechId,
        machineId: testMachineId,
        startAt: '2026-11-04T09:00:00.000Z',
        endAt: '2026-11-04T11:00:00.000Z',
        notes: 'Priority batch for customer audit',
      },
      'idemp-assign-success'
    );

    expect(assignResult.data.task.status).toBe('ASSIGNED');
    expect(assignResult.data.task.assignedTechnicianId).toBe(qualifiedTechId);
    expect(assignResult.data.task.assignedMachineId).toBe(testMachineId);
    expect(assignResult.data.bookings.length).toBe(2);

    // 3. Confirm bookings in DB
    const bookings = await fixture.db.resourceBooking.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(bookings.length).toBe(2);
    expect(bookings.some((b) => b.resourceType === 'TECHNICIAN' && b.resourceId === qualifiedTechId)).toBe(true);
    expect(bookings.some((b) => b.resourceType === 'MACHINE' && b.resourceId === testMachineId)).toBe(true);

    // 4. Verify audit workflow event
    const event = await fixture.db.workflowEvent.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, action: 'ASSIGN' },
    });
    expect(event).toBeDefined();
    expect(event?.toStatus).toBe('ASSIGNED');
  });

  // -----------------------------------------------------------------
  // 3. Reschedule Task Assignment (rescheduleTaskAssignment)
  // -----------------------------------------------------------------
  it('reschedules assigned task to new slot and atomically replaces resource bookings', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const taskCurrent = await fixture.db.task.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: op10TaskId } },
    });

    // 1. Stale version check
    await expect(
      planningService.rescheduleTaskAssignment(
        planner,
        op10TaskId,
        {
          expectedVersion: taskCurrent.version + 99,
          startAt: '2026-11-04T13:00:00.000Z',
          endAt: '2026-11-04T15:00:00.000Z',
        },
        'idemp-resched-stale'
      )
    ).rejects.toThrowError(ConflictError);

    // 2. Reschedule to new window
    const reschedResult = await planningService.rescheduleTaskAssignment(
      planner,
      op10TaskId,
      {
        expectedVersion: taskCurrent.version,
        startAt: '2026-11-04T13:00:00.000Z',
        endAt: '2026-11-04T15:00:00.000Z',
        notes: 'Rescheduled for tooling inspection',
      },
      'idemp-resched-success'
    );

    expect(reschedResult.data.bookings.length).toBe(2);
    expect(new Date(reschedResult.data.bookings[0].startAt).toISOString()).toBe('2026-11-04T13:00:00.000Z');

    // Verify prior bookings replaced
    const confirmedBookings = await fixture.db.resourceBooking.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(confirmedBookings.length).toBe(2);
    expect(confirmedBookings[0].startAt.toISOString()).toBe('2026-11-04T13:00:00.000Z');

    // Verify cancelled bookings exist from prior slot
    const cancelledBookings = await fixture.db.resourceBooking.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, status: 'CANCELLED' },
    });
    expect(cancelledBookings.length).toBe(2);
  });

  // -----------------------------------------------------------------
  // 4. Cancel Task Assignment (cancelTaskAssignment)
  // -----------------------------------------------------------------
  it('cancels assignment, releases confirmed bookings to CANCELLED, and reverts task to READY', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const cancelResult = await planningService.cancelTaskAssignment(
      planner,
      op10TaskId,
      { notes: 'Planner reallocation' },
      'idemp-cancel-assign'
    );

    expect(cancelResult.data.status).toBe('READY');
    expect(cancelResult.data.assignedTechnicianId).toBeNull();
    expect(cancelResult.data.assignedMachineId).toBeNull();

    // Verify confirmed bookings are 0
    const confirmedBookings = await fixture.db.resourceBooking.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, status: 'CONFIRMED' },
    });
    expect(confirmedBookings.length).toBe(0);

    // Verify CANCEL_ASSIGNMENT event recorded
    const cancelEvent = await fixture.db.workflowEvent.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, taskId: op10TaskId, action: 'CANCEL_ASSIGNMENT' },
    });
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent?.toStatus).toBe('READY');
  });

  // -----------------------------------------------------------------
  // 5. Dispatch Readiness Read Model (getTaskDispatchReadiness)
  // -----------------------------------------------------------------
  it('evaluates task dispatch readiness with predecessors and material demand states', async () => {
    const planner = fixture.alpha.users.planner.principal;

    // 1. OP-10 (no predecessor, unallocated material) -> BLOCKED_MATERIAL
    const op10Readiness = await planningService.getTaskDispatchReadiness(planner, op10TaskId);
    expect(op10Readiness.taskId).toBe(op10TaskId);
    expect(op10Readiness.readinessStatus).toBe('BLOCKED_MATERIAL');
    expect(op10Readiness.uncompletedPredecessors.length).toBe(0);
    expect(op10Readiness.uncoveredDemands.length).toBeGreaterThanOrEqual(1);

    // 2. QC-20 (predecessor OP-10 not completed) -> WAITING_PREDECESSOR
    const qc20Readiness = await planningService.getTaskDispatchReadiness(planner, qc20TaskId);
    expect(qc20Readiness.taskId).toBe(qc20TaskId);
    expect(qc20Readiness.readinessStatus).toBe('WAITING_PREDECESSOR');
    expect(qc20Readiness.uncompletedPredecessors.some((p) => p.id === op10TaskId)).toBe(true);
  });
});
