import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { ImpactAnalysisService } from '@/server/modules/planning/impact';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';

describe('I01: Production Dependency Intelligence (Impact & Connected CPM/Ripple)', () => {
  let fixture: FactoryFixture;
  let impactService: ImpactAnalysisService;
  let orderService: OrderService;
  let workflowService: WorkflowService;
  let engineeringService: EngineeringService;

  let orderAId: string;
  let orderBId: string;
  let rawItemId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    impactService = new ImpactAnalysisService(fixture.db);
    orderService = new OrderService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);

    const { alpha } = fixture;
    rawItemId = alpha.masters.rawItemId;

    // 1. Create Workflow Template with OP-10 -> OP-20 -> OP-30
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-IMPACT-01',
        name: 'Impact Dependency Flow',
      },
      'key-wf-impact-tmpl'
    );

    const draft = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Impact Flow V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'Prep & Cut',
              type: 'OPERATION',
              plannedDurationMinutes: 120, // 2h
            },
            {
              key: 'OP-20',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 240, // 4h
            },
            {
              key: 'OP-30',
              name: 'Final Deburr',
              type: 'OPERATION',
              plannedDurationMinutes: 60, // 1h
            },
          ],
          edges: [
            { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' },
            { fromNodeKey: 'OP-20', toNodeKey: 'OP-30', joinPolicy: 'AND' },
          ],
        },
      },
      'key-wf-impact-draft'
    );

    const pub = await workflowService.publishVersion(
      alpha.users.owner.principal,
      draft.data.id,
      'key-wf-impact-pub'
    );

    // 2. Order A: Consumes rawItemId on OP-10
    const orderA = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 15,
        requestedDate: '2026-11-25T00:00:00Z',
      },
      'key-order-a-impact'
    );
    orderAId = orderA.data.id;
    const revAId = orderA.data.engineeringRevisions[0].id;

    await fixture.db.order.update({
      where: { id: orderAId },
      data: { promisedDate: new Date('2026-11-25T00:00:00Z') },
    });

    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revAId,
      {
        workflowVersionId: pub.data.id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'key-eng-a-draft'
    );
    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revAId,
      'key-eng-a-approve'
    );
    await releaseOrder(alpha.users.owner.principal, orderAId, 'key-rel-a', fixture.db);

    // 3. Order B: Independent Order
    const orderB = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-12-05T00:00:00Z',
      },
      'key-order-b-impact'
    );
    orderBId = orderB.data.id;
    const revBId = orderB.data.engineeringRevisions[0].id;

    await fixture.db.order.update({
      where: { id: orderBId },
      data: { promisedDate: new Date('2026-12-05T00:00:00Z') },
    });

    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revBId,
      {
        workflowVersionId: pub.data.id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'key-eng-b-draft'
    );
    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revBId,
      'key-eng-b-approve'
    );
    await releaseOrder(alpha.users.owner.principal, orderBId, 'key-rel-b', fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('calculates ripple blast radius for raw material ETA delay (+3 days)', async () => {
    const { alpha } = fixture;

    const result = await impactService.analyzeImpact(alpha.users.planner.principal, {
      disruptionType: 'MATERIAL_DELAY',
      entityId: rawItemId,
      delayDays: 3,
      reason: 'Freight vessel port congestion',
    });

    expect(result).toBeDefined();
    expect(result.evaluationId).toBeDefined();
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.delayDays).toBe(3);

    // Both Order A and Order B consume this raw material, so both are affected
    expect(result.affectedOrders.length).toBe(2);
    const affectedOrderIds = result.affectedOrders.map((o) => o.orderId);
    expect(affectedOrderIds).toContain(orderAId);
    expect(affectedOrderIds).toContain(orderBId);

    // Check downstream task cascade: OP-10 directly blocked, OP-20 & OP-30 downstream blocked
    expect(result.blockedTaskIds.length).toBeGreaterThanOrEqual(6); // 3 tasks per order * 2 orders
    expect(result.criticalPathTaskIds.length).toBeGreaterThan(0);

    // Verify delta days and severity for delayed order
    const orderAImpact = result.affectedOrders.find((o) => o.orderId === orderAId);
    expect(orderAImpact).toBeDefined();
    expect(orderAImpact!.deltaDays).toBe(3);
    expect(orderAImpact!.severity).toBe('AT_RISK');
  });

  it('reports zero disruption when analyzing an unconsumed or irrelevant entity', async () => {
    const { alpha } = fixture;

    // Use non-existent UUID or FG item which is not consumed by OP-10 demands
    const result = await impactService.analyzeImpact(alpha.users.planner.principal, {
      disruptionType: 'MATERIAL_DELAY',
      entityId: alpha.masters.fgItemId,
      delayDays: 2,
    });

    expect(result.affectedOrders.length).toBe(0);
    expect(result.blockedTaskIds.length).toBe(0);
    expect(result.summary).toContain('No active production orders are blocked');
  });
});
