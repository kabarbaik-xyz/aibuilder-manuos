import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FactoryMemoryService } from '@/server/modules/intelligence/memory';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { parseQuantity } from '@/domain/quantity';

describe('I06: Factory Memory from Measured Execution & QC Evidence', () => {
  let fixture: FactoryFixture;
  let memoryService: FactoryMemoryService;
  let orderService: OrderService;
  let workflowService: WorkflowService;
  let engineeringService: EngineeringService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    memoryService = new FactoryMemoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('reports insufficient history when fewer than 3 completed runs exist', async () => {
    const { alpha } = fixture;

    const memory = await memoryService.queryFactoryMemory(alpha.users.planner.principal, {
      itemId: alpha.masters.fgItemId,
      nodeKey: 'OP-10',
    });

    expect(memory).toBeDefined();
    expect(memory.hasSufficientHistory).toBe(false);
    expect(memory.sampleCount).toBe(0);
    expect(memory.meanOverrunPct).toBeNull();
    expect(memory.recommendation.title).toContain('Insufficient');
  });

  it('computes exact arithmetic mean overrun and rework once 3+ runs complete', async () => {
    const { alpha } = fixture;

    // 1. Create template & version
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-MEM-01',
        name: 'Memory Flow',
      },
      'key-wf-mem-tmpl'
    );

    const draft = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Memory Flow V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 100,
            },
          ],
          edges: [],
        },
      },
      'key-wf-mem-draft'
    );

    const pub = await workflowService.publishVersion(
      alpha.users.owner.principal,
      draft.data.id,
      'key-wf-mem-pub'
    );

    // 2. Helper to create and complete a run
    const createCompletedRun = async (
      orderNum: string,
      actualDurationMinutes: number,
      passedUnits: number,
      reworkUnits: number,
      key: string
    ) => {
      const order = await orderService.createOrderDraft(
        alpha.users.owner.principal,
        {
          customerId: alpha.masters.customerId,
          orderTypeId: alpha.masters.orderTypeId,
          itemId: alpha.masters.fgItemId,
          orderedQuantity: 10,
          requestedDate: '2026-12-01T00:00:00Z',
        },
        `order-draft-${key}`
      );

      await engineeringService.saveEngineeringDraft(
        alpha.users.owner.principal,
        order.data.engineeringRevisions[0].id,
        {
          workflowVersionId: pub.data.id,
          bomLines: [],
        },
        `eng-draft-${key}`
      );

      await engineeringService.approveEngineeringRevision(
        alpha.users.owner.principal,
        order.data.engineeringRevisions[0].id,
        `eng-appr-${key}`
      );

      const releaseRes = await releaseOrder(
        alpha.users.owner.principal,
        order.data.id,
        `release-${key}`,
        fixture.db
      );

      const moId = releaseRes.data.moId;
      const taskId = releaseRes.data.taskIds['OP-10'];
      const task = await fixture.db.task.findUnique({
        where: { id: taskId },
      });

      expect(task).toBeDefined();

      // Complete the task directly with actual recorded duration
      await fixture.db.task.update({
        where: { id: task!.id },
        data: {
          status: 'COMPLETED',
          actualDurationMinutes,
          completedAt: new Date(),
        },
      });

      // Record output & inspection
      const out = await fixture.db.productionOutput.create({
        data: {
          workspace: { connect: { id: alpha.workspaceId } },
          task: { connect: { id: task!.id } },
          item: { connect: { id: alpha.masters.fgItemId } },
          destinationLocation: { connect: { id: alpha.masters.quarantineLocationId } },
          outputAtoms: parseQuantity(String(passedUnits + reworkUnits)),
          operatorUser: { connect: { id: alpha.users.operator.userId } },
        },
      });

      await fixture.db.inspection.create({
        data: {
          workspace: { connect: { id: alpha.workspaceId } },
          productionOutput: { connect: { id: out.id } },
          inspectorUser: { connect: { id: alpha.users.qc.userId } },
          sourceType: 'PRODUCTION',
          status: 'FINALIZED',
          inspectedAtoms: parseQuantity(String(passedUnits + reworkUnits)),
          passedAtoms: parseQuantity(String(passedUnits)),
          reworkAtoms: parseQuantity(String(reworkUnits)),
          scrappedAtoms: 0n,
        },
      });
    };

    // Run 1: 100 planned, 110 actual (+10% overrun), 8 pass, 2 rework
    await createCompletedRun('ORD-MEM-1', 110, 8, 2, 'run-1');

    // Run 2: 100 planned, 120 actual (+20% overrun), 9 pass, 1 rework
    await createCompletedRun('ORD-MEM-2', 120, 9, 1, 'run-2');

    // With 2 runs, still insufficient
    const cohort = { itemId: alpha.masters.fgItemId, nodeKey: 'OP-10' };
    const memAfter2 = await memoryService.queryFactoryMemory(alpha.users.planner.principal, cohort);
    expect(memAfter2.hasSufficientHistory).toBe(false);
    expect(memAfter2.sampleCount).toBe(2);

    // Run 3: 100 planned, 130 actual (+30% overrun), 10 pass, 0 rework
    await createCompletedRun('ORD-MEM-3', 130, 10, 0, 'run-3');

    // With 3 runs: mean overrun = (10 + 20 + 30) / 3 = 20.0%
    // Total inspected = (8+2) + (9+1) + (10+0) = 30 units
    // Total rework = 2 + 1 + 0 = 3 units -> 10.0%
    const memAfter3 = await memoryService.queryFactoryMemory(alpha.users.planner.principal, cohort);
    expect(memAfter3.hasSufficientHistory).toBe(true);
    expect(memAfter3.sampleCount).toBe(3);
    expect(memAfter3.meanOverrunPct).toBe(20.0);
    expect(memAfter3.meanReworkPct).toBe(10.0);
    expect(memAfter3.recommendation.suggestedBufferPct).toBeNull();
    expect(memAfter3.recommendation.title).toContain('20%');

    const boundedService = new FactoryMemoryService(fixture.db, { maxCohortTasks: 2 });
    await expect(boundedService.queryFactoryMemory(alpha.users.planner.principal, cohort))
      .rejects.toThrow(/exceeds the 2-run analysis limit/i);
    const boundedEvidenceService = new FactoryMemoryService(fixture.db, { maxEvidenceRecords: 2 });
    await expect(boundedEvidenceService.queryFactoryMemory(alpha.users.planner.principal, cohort))
      .rejects.toThrow(/exceeds the 2-record evidence limit/i);

    const firstPage = await memoryService.queryFactoryMemory(alpha.users.planner.principal, { ...cohort, page: 1, pageSize: 10 });
    expect(firstPage.pagination).toMatchObject({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    expect(firstPage.sampleCount).toBe(3);
    expect(firstPage.runs).toHaveLength(3);
    expect(firstPage.runs[0].itemId).toBe(alpha.masters.fgItemId);
    expect(firstPage.runs[0].passedAtoms).toBeDefined();

    const versionScoped = await memoryService.queryFactoryMemory(alpha.users.planner.principal, {
      ...cohort,
      workflowVersionId: pub.data.id,
    } as never);
    expect(versionScoped.runs).toHaveLength(3);
    expect(versionScoped.runs.every(run => run.workflowVersionId === pub.data.id)).toBe(true);
    const otherVersion = await memoryService.queryFactoryMemory(alpha.users.planner.principal, {
      ...cohort,
      workflowVersionId: 'unrelated-version',
    } as never);
    expect(otherVersion.completedRunCount).toBe(0);
    const outsideCompletionWindow = await memoryService.queryFactoryMemory(alpha.users.planner.principal, {
      ...cohort,
      completedFrom: '2000-01-01',
      completedTo: '2000-12-31',
    });
    expect(outsideCompletionWindow.completedRunCount).toBe(0);
    await expect(memoryService.queryFactoryMemory(alpha.users.planner.principal, {
      ...cohort,
      completedFrom: '2026-12-31',
      completedTo: '2026-01-01',
    })).rejects.toThrow(/on or before/i);
  });
});
