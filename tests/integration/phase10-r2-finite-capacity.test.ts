import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('Phase 10: R2 Finite Capacity, Feasible Promises & Factory Memory', () => {
  let fixture: FactoryFixture;
  let planningService: PlanningService;
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
    recommendationService = new TechnicianRecommendationService(fixture.db);
    promiseService = new PromiseService(fixture.db);
    memoryService = new FactoryMemoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    mastersService = new MastersService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

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

    // 5. Create Order and release
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T17:00:00.000Z',
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
    it('evaluates promise feasibility and provides candidate completion dates', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const evaluation = await promiseService.evaluatePromise(owner, {
        itemId: alpha.masters.fgItemId,
        quantity: 10,
        requestedDate: '2026-11-25T17:00:00.000Z',
      });

      expect(evaluation.isFeasibleOnRequestedDate).toBeDefined();
      expect(evaluation.feasibleDate).toBeDefined();
      expect(evaluation.confidence).toBeDefined();
      expect(evaluation.materialReadiness).toBeDefined();
      expect(evaluation.capacityLoad).toBeDefined();
    });
  });

  describe('4. Factory Memory Query & Insufficient Evidence Guard', () => {
    it('truthfully handles factory memory queries and signals insufficient history when uncalibrated', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const memory = await memoryService.queryFactoryMemory(owner, {
        itemId: alpha.masters.fgItemId,
      });

      expect(memory.sampleCount).toBeDefined();
      expect(memory.hasSufficientHistory).toBe(false);
      expect(memory.recommendation).toBeDefined();
      expect(memory.recommendation.description).toContain('At least 3 completed production runs');
    });
  });
});
