import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { PlanningService } from '@/server/modules/planning/service';
import { TechnicianRecommendationService } from '@/server/modules/planning/recommendations';
import { PromiseService } from '@/server/modules/intelligence/promise';
import { FactoryMemoryService } from '@/server/modules/intelligence/memory';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { MastersService } from '@/server/modules/masters/service';
import { ScheduleProposalService } from '@/server/modules/planning/schedule-proposals';
import { RecoveryService } from '@/server/modules/intelligence/recovery';

describe('Phase 10: R2 Finite Capacity, Feasible Promises & Factory Memory', () => {
  let fixture: FactoryFixture;
  let planningService: PlanningService;
  let scheduleProposalService: ScheduleProposalService;
  let recoveryService: RecoveryService;
  let recommendationService: TechnicianRecommendationService;
  let promiseService: PromiseService;
  let memoryService: FactoryMemoryService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let workflowService: WorkflowService;
  let mastersService: MastersService;

  let testOrderId: string;
  let testInstanceId: string;
  let task1Id: string;
  let task2Id: string;
  let secondTechId: string;
  let certId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    planningService = new PlanningService(fixture.db);
    scheduleProposalService = new ScheduleProposalService(fixture.db);
    recoveryService = new RecoveryService(fixture.db);
    recommendationService = new TechnicianRecommendationService(fixture.db);
    promiseService = new PromiseService(fixture.db);
    memoryService = new FactoryMemoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    mastersService = new MastersService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: alpha.users.planner.principal.membershipId } },
      data: { supervisorMembershipId: owner.membershipId },
    });

    // 1. Create a mandatory aerospace welding certification
    const cert = await fixture.db.certification.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'CERT-AERO-WELD',
        name: 'Aerospace TIG Welding Class 1',
        issuer: 'AWS D17.1',
        isActive: true,
      },
    });
    certId = cert.id;

    // 2. Assign certification to operatorAlpha (valid for 1 year)
    await fixture.db.technicianCertification.create({
      data: {
        workspaceId: alpha.workspaceId,
        technicianId: alpha.masters.technicianId,
        certificationId: certId,
        issuedDate: '2026-01-01',
        validUntil: '2027-01-01',
        validFromDate: new Date('2026-01-01T00:00:00.000Z'),
        expiresAtDate: new Date('2027-01-01T23:59:59.999Z'),
        status: 'ACTIVE',
      },
    });

    // 3. Create a second technician (Tech-02) without this certification
    const tech2 = await fixture.db.technician.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'TECH-02',
        name: 'Junior Fabricator',
        departmentId: alpha.masters.departmentId,
        calendarId: alpha.masters.calendarId,
        isActive: true,
      },
    });
    secondTechId = tech2.id;

    // 4. Create multi-step Workflow: Op 1 (Roughing) -> Op 2 (Precision Welding)
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P10-MULTI',
        name: 'Phase 10 Multi-Operation Routing',
      },
      'idemp-wf-p10-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P10 Routing V1',
          nodes: [
            {
              key: 'OP-10-ROUGH',
              name: 'CNC Roughing',
              type: 'OPERATION',
              plannedDurationMinutes: 120, // 2 hours
            },
            {
              key: 'OP-20-WELD',
              name: 'Aerospace Precision Weld',
              type: 'OPERATION',
              plannedDurationMinutes: 60, // 1 hour
            },
          ],
          edges: [
            {
              fromNodeKey: 'OP-10-ROUGH',
              toNodeKey: 'OP-20-WELD',
              joinPolicy: 'AND',
            },
          ],
        },
      },
      'idemp-wf-p10-draft'
    );
    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-p10-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-p10-pub');

    const plannerMembershipId = alpha.users.planner.principal.membershipId;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: plannerMembershipId } },
      data: { departmentId: alpha.masters.departmentId },
    });
    const lifecycleTemplate = await workflowService.createTemplate(owner, {
      orderTypeId: alpha.masters.orderTypeId,
      code: 'WF-P10-LIFECYCLE',
      name: 'Planning lifecycle integration',
      kind: 'ORDER_LIFECYCLE',
    }, 'p10-lifecycle-template');
    await workflowService.saveVersionDraft(owner, lifecycleTemplate.data.initialVersionId!, {
      definition: {
        schemaVersion: 1,
        name: 'Planning lifecycle integration',
        stages: [{
          key: 'PLAN', name: 'Schedule released work', action: 'PLAN_PRODUCTION',
          departmentId: alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: plannerMembershipId, departmentId: alpha.masters.departmentId },
          schedule: { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' },
          predecessors: [], forms: [],
        }],
      },
    }, 'p10-lifecycle-draft');
    await workflowService.publishVersion(owner, lifecycleTemplate.data.initialVersionId!, 'p10-lifecycle-publish');

    // 5. Create Order and release
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T17:00:00.000Z',
        lifecycleWorkflowVersionId: lifecycleTemplate.data.initialVersionId,
      },
      'idemp-order-p10-01'
    );
    testOrderId = orderRes.data.id;
    const testRevId = orderRes.data.engineeringRevisions[0].id;

    await engineeringService.saveEngineeringDraft(
      owner,
      testRevId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [],
      },
      'idemp-eng-p10-rev1'
    );
    await engineeringService.approveEngineeringRevision(owner, testRevId, 'idemp-eng-p10-appr');

    const releaseRes = await releaseOrder(owner, testOrderId, 'idemp-order-p10-rel', fixture.db);
    testInstanceId = releaseRes.data.instanceId;

    const tasks = await fixture.db.task.findMany({
      where: { workspaceId: alpha.workspaceId, instanceId: testInstanceId },
      orderBy: { nodeKey: 'asc' },
    });
    task1Id = tasks.find((t) => t.nodeKey === 'OP-10-ROUGH')!.id;
    task2Id = tasks.find((t) => t.nodeKey === 'OP-20-WELD')!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Deterministic Constraint-Aware Finite Capacity Scheduling', () => {
    it('schedules multi-operation tasks enforcing strictly forward dependency order', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const horizon = new Date('2026-10-19T08:00:00.000Z'); // Monday 08:00 AM

      const schedule = await planningService.scheduleTasks(owner, {
        orderId: testOrderId,
        startHorizon: horizon.toISOString(),
      });

      expect(schedule.scheduledTasks.length).toBe(2);

      const t1 = schedule.scheduledTasks.find((t) => t.taskId === task1Id);
      const t2 = schedule.scheduledTasks.find((t) => t.taskId === task2Id);

      expect(t1).toBeDefined();
      expect(t2).toBeDefined();

      const t1End = new Date(t1!.endAt).getTime();
      const t2Start = new Date(t2!.startAt).getTime();

      // Op 20 must start strictly on or after Op 10 ends
      expect(t2Start).toBeGreaterThanOrEqual(t1End);
      expect(schedule.makespanMinutes).toBeGreaterThanOrEqual(180); // 120 + 60
    });

    it('builds a dry-run from published roster and verified qualifications without creating bookings', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;
      const machine = await fixture.db.machine.findUniqueOrThrow({ where: { id: alpha.masters.machineId } });
      const nodes = await fixture.db.workflowNode.findMany({ where: { versionId: (await fixture.db.workflowInstance.findUniqueOrThrow({ where: { id: testInstanceId } })).workflowVersionId } });
      await Promise.all(nodes.map((node) => fixture.db.workflowNode.update({
        where: { id: node.id },
        data: { requirementsJson: JSON.stringify({ machineClassId: machine.machineClassId, requiredCertIds: ['CERT-AERO-WELD'] }) },
      })));
      const shiftStart = new Date('2026-10-19T08:00:00.000Z');
      const shiftEnd = new Date('2026-10-19T16:00:00.000Z');
      await fixture.db.rosterInterval.createMany({ data: [
        { workspaceId: alpha.workspaceId, technicianId: alpha.masters.technicianId, intervalType: 'SHIFT', status: 'PUBLISHED', startAt: shiftStart, endAt: shiftEnd },
        { workspaceId: alpha.workspaceId, machineId: alpha.masters.machineId, intervalType: 'SHIFT', status: 'PUBLISHED', startAt: shiftStart, endAt: shiftEnd },
      ] });
      const before = await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } });

      const proposal = await scheduleProposalService.propose(owner, {
        orderId: testOrderId,
        instanceId: testInstanceId,
        startHorizon: shiftStart.toISOString(),
        horizonDays: 7,
      });

      expect(proposal.state).toBe('COMPLETE');
      expect(proposal.tasks).toHaveLength(2);
      expect(proposal.tasks.every((task) => task.status === 'SCHEDULED' && task.technicianId === alpha.masters.technicianId && task.machineId === alpha.masters.machineId)).toBe(true);
      const predecessor = proposal.tasks.find((task) => task.taskId === task1Id)!;
      const dependent = proposal.tasks.find((task) => task.predecessorTaskIds.includes(task1Id))!;
      expect(new Date(dependent.startAt!).getTime()).toBeGreaterThanOrEqual(new Date(predecessor.endAt!).getTime());
      expect(proposal.scope).toMatchObject({ orderId: testOrderId, instanceId: testInstanceId, workflowVersionId: expect.any(String), engineeringRevisionId: expect.any(String) });
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(before);
    });

    it('rejects a caller-supplied calendar instead of treating it as site availability authority', async () => {
      const { alpha } = fixture;
      await expect(scheduleProposalService.propose(alpha.users.owner.principal, {
        orderId: testOrderId,
        instanceId: testInstanceId,
        startHorizon: '2026-10-19T08:00:00.000Z',
        calendar: { shiftStartHour: 0, shiftHours: 24, workDays: [0, 1, 2, 3, 4, 5, 6] },
      })).rejects.toThrow();
    });
  });

  describe('2. Transparent Qualification & Workload Technician Recommendations', () => {
    it('ranks fully certified technician over uncertified candidate with clear violation reasons', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const report = await recommendationService.recommendTechnicians(owner, {
        departmentId: alpha.masters.departmentId,
        slotStart: new Date('2026-10-20T08:00:00.000Z'),
        slotEnd: new Date('2026-10-20T10:00:00.000Z'),
        requiredCertifications: [{ certificationId: certId }],
      });

      expect(report.eligibleCount).toBe(1);
      expect(report.recommendedTechnicianId).toBe(alpha.masters.technicianId);

      const disqualified = report.candidates.find((c) => c.technicianId === secondTechId);
      expect(disqualified).toBeDefined();
      expect(disqualified?.isEligible).toBe(false);
      expect(disqualified?.violations.length).toBeGreaterThan(0);
      expect(disqualified?.rationale).toContain('Disqualified');
    });

    it('identifies qualified capacity gap when no technician satisfies mandatory credentials', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const report = await recommendationService.recommendTechnicians(owner, {
        departmentId: alpha.masters.departmentId,
        slotStart: new Date('2026-10-20T08:00:00.000Z'),
        slotEnd: new Date('2026-10-20T10:00:00.000Z'),
        requiredCertifications: [{ certificationId: 'non-existent-cert-999' }],
      });

      expect(report.eligibleCount).toBe(0);
      expect(report.recommendedTechnicianId).toBeNull();
      expect(report.qualifiedCapacityGap).not.toBeNull();
    });
  });

  describe('3. Grounded Feasible Promise Evaluation', () => {
    it('evaluates a requested date against the same released-job finite-capacity result', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const evaluation = await promiseService.evaluatePromise(owner, {
        orderId: testOrderId,
        instanceId: testInstanceId,
        requestedQuantity: '10',
        requestedDate: '2026-10-20',
      });

      expect(evaluation.state).toBe('EVALUATED');
      expect(evaluation.scheduleState).toBe('COMPLETE');
      expect(evaluation.isFeasibleOnRequestedDate).toBe(true);
      expect(evaluation.feasibleDate).toMatch(/^2026-10-19/);
      expect(evaluation.evidence).toMatchObject({ workflowVersionId: expect.any(String), engineeringRevisionId: expect.any(String) });
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(0);
    });
  });

  describe('4. Schedule-grounded recovery review proposals', () => {
    it('persists one idempotent schedule review with captured versions and no bookings', async () => {
      const { alpha } = fixture;
      await fixture.db.machine.updateMany({ where: { workspaceId: alpha.workspaceId, archivedAt: null }, data: { hourlyRateCents: 6000 } });
      const beforeBookings = await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } });
      const input = { orderId: testOrderId, instanceId: testInstanceId };
      const first = await recoveryService.proposeScheduleReview(alpha.users.planner.principal, input, 'phase10-recovery-review');
      const replay = await recoveryService.proposeScheduleReview(alpha.users.planner.principal, input, 'phase10-recovery-review');

      expect(first.state).toBe('SAVED');
      if (first.state !== 'SAVED' || replay.state !== 'SAVED') throw new Error('Expected complete schedule review to be saved.');
      expect(first.scheduleReview?.tasks).toHaveLength(2);
      expect(first.scheduleReview?.machineCostEstimate).toMatchObject({ status: 'COMPLETE', currency: 'IDR', pricedTaskCount: expect.any(Number), unpricedTaskCount: 0 });
      expect(first.scheduleReview?.machineCostEstimate?.totalMinorUnits).toBeGreaterThan(0);
      expect(first.scheduleReview?.workflowVersionId).toBeTruthy();
      expect(replay.id).toBe(first.id);
      expect(await fixture.db.recoveryProposal.count({ where: { workspaceId: alpha.workspaceId, orderId: testOrderId } })).toBe(1);
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(beforeBookings);
      expect(await fixture.db.auditEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'recovery.schedule-review.create' } })).toBe(1);
    });

    it('does not save a recovery review when qualifications no longer support a complete schedule', async () => {
      const { alpha } = fixture;
      await fixture.db.technicianCertification.updateMany({
        where: { workspaceId: alpha.workspaceId, certificationId: certId },
        data: { status: 'REVOKED' },
      });
      const before = await fixture.db.recoveryProposal.count({ where: { workspaceId: alpha.workspaceId, orderId: testOrderId } });
      const result = await recoveryService.proposeScheduleReview(alpha.users.planner.principal, {
        orderId: testOrderId,
        instanceId: testInstanceId,
      }, 'phase10-recovery-incomplete');

      expect(result.state).toBe('NOT_CONNECTED');
      if (result.state !== 'NOT_CONNECTED') throw new Error('Incomplete schedule should not be persisted.');
      expect(result.missingInputs.join(' ')).toContain('No active technician');
      expect(await fixture.db.recoveryProposal.count({ where: { workspaceId: alpha.workspaceId, orderId: testOrderId } })).toBe(before);
    });
  });

  describe('5. Factory Memory Query & Insufficient Evidence Guard', () => {
    it('truthfully handles factory memory queries and signals insufficient history when uncalibrated', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const memory = await memoryService.queryFactoryMemory(owner, {
        itemId: alpha.masters.fgItemId,
      });

      expect(memory.sampleCount).toBeDefined();
      expect(memory.hasSufficientHistory).toBe(false);
      expect(memory.recommendation).toBeDefined();
      expect(memory.recommendation.description).toContain('Workspace-wide averages are not shown');
    });
  });

  describe('6. Transactional application of reviewed schedule proposals', () => {
    it('rejects stale reviewed evidence without writes and applies a current proposal idempotently', async () => {
      const { alpha } = fixture;
      const planner = alpha.users.planner.principal;
      await fixture.db.technicianCertification.updateMany({
        where: { workspaceId: alpha.workspaceId, certificationId: certId },
        data: { status: 'ACTIVE', revokedAt: null },
      });
      const machine = await fixture.db.machine.findUniqueOrThrow({ where: { id: alpha.masters.machineId } });
      const instance = await fixture.db.workflowInstance.findUniqueOrThrow({ where: { id: testInstanceId } });
      const nodes = await fixture.db.workflowNode.findMany({ where: { versionId: instance.workflowVersionId } });
      await Promise.all(nodes.map((node) => fixture.db.workflowNode.update({
        where: { id: node.id },
        data: { requirementsJson: JSON.stringify({ machineClassId: machine.machineClassId, requiredCertIds: ['CERT-AERO-WELD'] }) },
      })));
      const slotStart = new Date('2026-10-19T08:00:00.000Z');
      await fixture.db.rosterInterval.createMany({ data: [
        { workspaceId: alpha.workspaceId, technicianId: alpha.masters.technicianId, intervalType: 'SHIFT', status: 'PUBLISHED', startAt: slotStart, endAt: new Date('2026-10-19T16:00:00.000Z') },
        { workspaceId: alpha.workspaceId, machineId: alpha.masters.machineId, intervalType: 'SHIFT', status: 'PUBLISHED', startAt: slotStart, endAt: new Date('2026-10-19T16:00:00.000Z') },
      ] });
      const request = {
        orderId: testOrderId,
        instanceId: testInstanceId,
        startHorizon: '2026-10-19T08:00:00.000Z',
        horizonDays: 7,
      };
      const proposal = await scheduleProposalService.propose(planner, request);
      expect(proposal.state).toBe('COMPLETE');
      const reviewed = {
        ...request,
        expected: {
          orderVersion: proposal.scope.orderVersion,
          workflowVersionId: proposal.scope.workflowVersionId,
          engineeringRevisionId: proposal.scope.engineeringRevisionId,
          tasks: proposal.tasks.map(({ taskId, version, status, startAt, endAt, technicianId, machineId }) => ({
            taskId, version, status, startAt, endAt, technicianId, machineId,
          })),
        },
      };
      const beforeBookings = await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } });
      const stale = structuredClone(reviewed);
      stale.expected.tasks[0].version += 1;
      await expect(scheduleProposalService.applyReviewedProposal(planner, stale, 'phase10-schedule-apply-stale')).rejects.toMatchObject({ code: 'STALE_VERSION' });
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(beforeBookings);
      expect(await fixture.db.workflowEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'SCHEDULE_PROPOSAL_APPLY' } })).toBe(0);

      const originalEvaluation = PlanningService.prototype.evaluateAssignmentInTransaction;
      let evaluationCount = 0;
      const evaluationSpy = vi.spyOn(PlanningService.prototype, 'evaluateAssignmentInTransaction').mockImplementation(async function (this: PlanningService, ...args: Parameters<PlanningService['evaluateAssignmentInTransaction']>) {
        evaluationCount += 1;
        if (evaluationCount === 2) throw new Error('Injected second-task revalidation failure');
        return originalEvaluation.apply(this, args);
      });
      try {
        await expect(scheduleProposalService.applyReviewedProposal(planner, reviewed, 'phase10-schedule-apply-rollback')).rejects.toThrow('Injected second-task revalidation failure');
      } finally {
        evaluationSpy.mockRestore();
      }
      expect(await fixture.db.task.count({ where: { workspaceId: alpha.workspaceId, instanceId: testInstanceId, status: { in: ['PENDING', 'READY'] } } })).toBe(2);
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(beforeBookings);
      expect(await fixture.db.workflowEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'SCHEDULE_PROPOSAL_APPLY' } })).toBe(0);

      const applied = await scheduleProposalService.applyReviewedProposal(planner, reviewed, 'phase10-schedule-apply-ok');
      const replay = await scheduleProposalService.applyReviewedProposal(planner, reviewed, 'phase10-schedule-apply-ok');
      expect(applied.data.state).toBe('APPLIED');
      expect(replay.meta.replayed).toBe(true);
      expect(await fixture.db.task.count({ where: { workspaceId: alpha.workspaceId, instanceId: testInstanceId, status: 'ASSIGNED' } })).toBe(2);
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId, taskId: { in: [task1Id, task2Id] }, status: 'CONFIRMED' } })).toBe(4);
      expect(await fixture.db.workflowEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'SCHEDULE_PROPOSAL_APPLY' } })).toBe(2);
      expect(await fixture.db.auditEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'planning.schedule-proposal.apply' } })).toBe(1);
      const lifecycleStage = await fixture.db.orderLifecycleStage.findFirstOrThrow({
        where: { workspaceId: alpha.workspaceId, instance: { orderId: testOrderId }, stageKey: 'PLAN' },
      });
      expect(lifecycleStage.state).toBe('COMPLETED');
      expect(await fixture.db.orderLifecycleEvent.count({
        where: { workspaceId: alpha.workspaceId, stageId: lifecycleStage.id, eventType: 'STAGE_COMPLETED' },
      })).toBe(1);
      const lifecycleEvent = await fixture.db.orderLifecycleEvent.findFirstOrThrow({
        where: { workspaceId: alpha.workspaceId, stageId: lifecycleStage.id, eventType: 'STAGE_COMPLETED' },
      });
      expect(JSON.parse(lifecycleEvent.detailJson)).toEqual({ action: 'PLAN_PRODUCTION', completionFact: 'SCHEDULE_PROPOSAL_APPLIED' });

      await fixture.db.resourceBooking.deleteMany({ where: { workspaceId: alpha.workspaceId, taskId: { in: [task1Id, task2Id] } } });
      await fixture.db.workflowEvent.deleteMany({ where: { workspaceId: alpha.workspaceId, taskId: { in: [task1Id, task2Id] }, action: 'SCHEDULE_PROPOSAL_APPLY' } });
      await fixture.db.task.updateMany({
        where: { workspaceId: alpha.workspaceId, id: { in: [task1Id, task2Id] } },
        data: { status: 'PENDING', assignedTechnicianId: null, assignedMachineId: null, version: { increment: 1 } },
      });
      const recoveryReview = await recoveryService.proposeScheduleReview(planner, {
        orderId: testOrderId,
        instanceId: testInstanceId,
      }, 'phase10-recovery-apply-review');
      expect(recoveryReview.state).toBe('SAVED');
      if (recoveryReview.state !== 'SAVED') throw new Error('Expected a saved recovery schedule review.');

      const recoveryRecord = await fixture.db.recoveryProposal.findFirstOrThrow({ where: { id: recoveryReview.id, workspaceId: alpha.workspaceId } });
      expect(recoveryRecord.approverMembershipId).toBe(alpha.users.owner.principal.membershipId);
      const originalProposalJson = recoveryRecord.proposalJson;
      await expect(recoveryService.applyScheduleReview({ ...alpha.users.owner.principal, permissions: planner.permissions, facilityIds: [] }, recoveryRecord.id, 'phase10-recovery-apply-facility-denied')).rejects.toThrow(/not found/i);
      await expect(recoveryService.applyScheduleReview({ ...fixture.beta.users.owner.principal, permissions: planner.permissions }, recoveryRecord.id, 'phase10-recovery-apply-tenant-denied')).rejects.toThrow(/not found/i);
      await expect(recoveryService.applyScheduleReview(planner, recoveryRecord.id, 'phase10-recovery-apply-wrong-approver')).rejects.toThrow(/direct supervisor/i);
      const corruptedReview = JSON.parse(originalProposalJson) as { scheduleReview: { facilityId: string | null } };
      corruptedReview.scheduleReview.facilityId = '00000000-0000-4000-8000-000000000000';
      await fixture.db.recoveryProposal.update({ where: { id: recoveryRecord.id }, data: { proposalJson: JSON.stringify(corruptedReview) } });
      await expect(recoveryService.applyScheduleReview({ ...alpha.users.owner.principal, permissions: planner.permissions }, recoveryRecord.id, 'phase10-recovery-apply-scope')).rejects.toMatchObject({ code: 'STALE_SCOPE' });
      await fixture.db.recoveryProposal.update({ where: { id: recoveryRecord.id }, data: { proposalJson: originalProposalJson } });
      expect((await fixture.db.recoveryProposal.findUniqueOrThrow({ where: { id: recoveryRecord.id } })).status).toBe('PROPOSED');

      const beforeRecoveryBookings = await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } });
      const originalRecoveryEvaluation = PlanningService.prototype.evaluateAssignmentInTransaction;
      let recoveryEvaluationCount = 0;
      const recoveryEvaluationSpy = vi.spyOn(PlanningService.prototype, 'evaluateAssignmentInTransaction').mockImplementation(async function (this: PlanningService, ...args: Parameters<PlanningService['evaluateAssignmentInTransaction']>) {
        recoveryEvaluationCount += 1;
        if (recoveryEvaluationCount === 2) throw new Error('Injected Recovery second-task revalidation failure');
        return originalRecoveryEvaluation.apply(this, args);
      });
      try {
        await expect(recoveryService.applyScheduleReview({ ...alpha.users.owner.principal, permissions: planner.permissions }, recoveryRecord.id, 'phase10-recovery-apply-rollback')).rejects.toThrow('Injected Recovery second-task revalidation failure');
      } finally {
        recoveryEvaluationSpy.mockRestore();
      }
      expect((await fixture.db.recoveryProposal.findUniqueOrThrow({ where: { id: recoveryRecord.id } })).status).toBe('PROPOSED');
      expect(await fixture.db.task.count({ where: { workspaceId: alpha.workspaceId, id: { in: [task1Id, task2Id] }, status: { in: ['PENDING', 'READY'] } } })).toBe(2);
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId } })).toBe(beforeRecoveryBookings);
      expect(await fixture.db.workflowEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'RECOVERY_SCHEDULE_APPLY' } })).toBe(0);

      const supervisor = { ...alpha.users.owner.principal, permissions: planner.permissions };
      const concurrentResults = await Promise.allSettled([
        recoveryService.applyScheduleReview(supervisor, recoveryRecord.id, 'phase10-recovery-apply-race-a'),
        recoveryService.applyScheduleReview(supervisor, recoveryRecord.id, 'phase10-recovery-apply-race-b'),
      ]);
      const successfulApply = concurrentResults.filter((result) => result.status === 'fulfilled');
      const rejectedApply = concurrentResults.filter((result) => result.status === 'rejected');
      expect(successfulApply).toHaveLength(1);
      expect(rejectedApply).toHaveLength(1);
      const successfulKey = successfulApply[0] === concurrentResults[0] ? 'phase10-recovery-apply-race-a' : 'phase10-recovery-apply-race-b';
      const recoveryApplied = (successfulApply[0] as PromiseFulfilledResult<Awaited<ReturnType<RecoveryService['applyScheduleReview']>>>).value;
      const recoveryReplay = await recoveryService.applyScheduleReview(supervisor, recoveryRecord.id, successfulKey);
      expect(recoveryApplied.data.status).toBe('APPROVED');
      expect(recoveryReplay.meta.replayed).toBe(true);
      expect((await fixture.db.recoveryProposal.findUniqueOrThrow({ where: { id: recoveryRecord.id } })).status).toBe('APPROVED');
      expect(await fixture.db.resourceBooking.count({ where: { workspaceId: alpha.workspaceId, taskId: { in: [task1Id, task2Id] }, status: 'CONFIRMED' } })).toBe(4);
      expect(await fixture.db.workflowEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'RECOVERY_SCHEDULE_APPLY' } })).toBe(2);
      expect(await fixture.db.auditEvent.count({ where: { workspaceId: alpha.workspaceId, action: 'recovery.schedule-review.apply' } })).toBe(1);
    });
  });
});
