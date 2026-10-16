import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { ChangeOrderService } from '@/server/modules/engineering/change-orders';
import { NcrService } from '@/server/modules/quality/ncr';
import { MaterialSubstituteService } from '@/server/modules/engineering/substitutes';
import { PublishedScheduleService } from '@/server/modules/planning/published-schedules';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 8: R1 Controlled Changes, Published Schedules & Connected Traceability', () => {
  let fixture: FactoryFixture;
  let orderService: OrderService;
  let changeOrderService: ChangeOrderService;
  let ncrService: NcrService;
  let substituteService: MaterialSubstituteService;
  let scheduleService: PublishedScheduleService;
  let engineeringService: EngineeringService;
  let workflowService: WorkflowService;

  let testOrderId: string;
  let testRevId: string;
  let subItemId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    orderService = new OrderService(fixture.db);
    changeOrderService = new ChangeOrderService(fixture.db);
    ncrService = new NcrService(fixture.db);
    substituteService = new MaterialSubstituteService(fixture.db);
    scheduleService = new PublishedScheduleService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

    // 1. Create a secondary raw material item for substitute testing
    const subItem = await fixture.db.item.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'RAW-AL6063-ROD',
        name: 'Aluminium 6063 Rod 25mm (Substitute)',
        itemType: 'RAW',
        baseUomId: alpha.masters.uomPcsId,
        isActive: true,
      },
    });
    subItemId = subItem.id;

    // 2. Create Workflow Template and Version
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P8-ROUTING',
        name: 'Phase 8 Precision Routing',
      },
      'idemp-wf-p8-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P8 Routing V1',
          nodes: [
            {
              key: 'CNC-01',
              name: 'CNC Roughing',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'idemp-wf-p8-draft'
    );
    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-p8-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-p8-pub');

    // 3. Create Order
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 50,
        requestedDate: '2026-11-20T17:00:00.000Z',
      },
      'idemp-order-p8-01'
    );
    testOrderId = orderRes.data.id;
    testRevId = orderRes.data.engineeringRevisions[0].id;

    // 4. Save and approve revision 1
    await engineeringService.saveEngineeringDraft(
      owner,
      testRevId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [
          {
            operationNodeKey: 'CNC-01',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
          },
        ],
      },
      'idemp-eng-p8-rev1'
    );
    await engineeringService.approveEngineeringRevision(owner, testRevId, 'idemp-eng-p8-appr1');

    // 5. Release Order -> creates running jobsheet at instructionRevision 1
    await releaseOrder(owner, testOrderId, 'idemp-order-p8-rel', fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Order Change Request (ORD-04)
  // -----------------------------------------------------------------
  it('creates, reviews, and applies an order change request to update delivery date', async () => {
    const owner = fixture.alpha.users.owner.principal;

    // A. Create OCR requesting date postponement
    const createOcrRes = await changeOrderService.createOrderChangeRequest(
      owner,
      {
        orderId: testOrderId,
        changeType: 'DATE',
        reason: 'Customer facility expansion delayed, requested new delivery date',
        requestedChanges: {
          requestedDate: '2026-12-05T17:00:00.000Z',
        },
      },
      'idemp-ocr-p8-01'
    );

    expect(createOcrRes.data.status).toBe('SUBMITTED');
    expect(createOcrRes.data.requestNumber).toContain('OCR-');

    // B. Approve and apply OCR
    const approveRes = await changeOrderService.approveOrderChangeRequest(
      owner,
      createOcrRes.data.id,
      { notes: 'Approved revised delivery date with customer signoff' },
      'idemp-ocr-p8-approve'
    );

    expect(approveRes.data.status).toBe('APPLIED');
    expect(approveRes.data.approvedByUserId).toBe(owner.userId);

    // C. Verify order was updated
    const updatedOrder = await fixture.db.order.findUniqueOrThrow({
      where: { id: testOrderId },
    });
    expect(updatedOrder.requestedDate.toISOString()).toBe('2026-12-05T17:00:00.000Z');
  });

  // -----------------------------------------------------------------
  // 2. Engineering Change Order & Active Job Migration (ENG-05, WFL-05)
  // -----------------------------------------------------------------
  it('creates ECO and migrates running active jobsheets to target engineering revision', async () => {
    const owner = fixture.alpha.users.owner.principal;

    // Verify initial jobsheet instructionRevision is 1
    const beforeJobsheet = await fixture.db.jobsheet.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, orderId: testOrderId },
    });
    expect(beforeJobsheet.instructionRevision).toBe(1);

    // A. Create ECO
    const ecoRes = await changeOrderService.createEngineeringChangeOrder(
      owner,
      {
        code: 'ECO-2026-P8-01',
        title: 'Upgrade roughing feed rate and tooling specification',
        description: 'Updated feed rate to 450mm/min and carbide insert geometry',
        sourceRevisionId: testRevId,
        migrationPolicy: 'RUNNING_JOBS_MIGRATE',
      },
      'idemp-eco-p8-01'
    );

    expect(ecoRes.data.status).toBe('DRAFT');
    expect(ecoRes.data.impactedJobsCount).toBeGreaterThanOrEqual(1);

    // B. Approve and apply ECO
    const applyEcoRes = await changeOrderService.approveAndApplyECO(
      owner,
      ecoRes.data.id,
      { notes: 'Approved for immediate factory deployment' },
      'idemp-eco-p8-apply'
    );
    expect(applyEcoRes.data.status).toBe('APPLIED');

    // C. Verify running jobsheet instructionRevision migrated to revision 2
    const afterJobsheet = await fixture.db.jobsheet.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, orderId: testOrderId },
    });
    expect(afterJobsheet.instructionRevision).toBe(2);
  });

  // -----------------------------------------------------------------
  // 3. Non-Conformance Reports (NCR) Lifecycle (QLT-03)
  // -----------------------------------------------------------------
  it('records NCR, prevents premature closure, and formally closes after containment and correction', async () => {
    const qc = fixture.alpha.users.qc.principal;

    // A. Create NCR
    const ncrRes = await ncrService.createNcr(
      qc,
      {
        title: 'Dimensional out-of-spec on outer diameter',
        description: 'Roughing diameter measured 25.12mm (tolerance is +/- 0.05mm)',
        severity: 'MAJOR',
      },
      'idemp-ncr-p8-01'
    );

    const ncrId = ncrRes.data.id;
    expect(ncrRes.data.status).toBe('OPEN');
    expect(ncrRes.data.ncrNumber).toContain('NCR-');

    // B. Attempt closing without containment/correction -> fails with BadRequestError
    await expect(
      ncrService.closeNcr(qc, ncrId, 'idemp-ncr-premature-close')
    ).rejects.toThrowError(BadRequestError);

    // C. Resolve NCR with root cause and containment
    const resolveRes = await ncrService.resolveNcr(
      qc,
      ncrId,
      {
        rootCause: 'Tool wear on roughing insert beyond service life',
        containmentAction: 'Quarantined all 10 parts from batch CNC-01',
        correctiveAction: 'Replaced insert, re-zeroed work coordinate, updated tool life preset to 120min',
      },
      'idemp-ncr-p8-resolve'
    );

    expect(resolveRes.data.status).toBe('CORRECTED');
    expect(resolveRes.data.resolvedAt).toBeDefined();

    // D. Close NCR formally
    const closeRes = await ncrService.closeNcr(qc, ncrId, 'idemp-ncr-p8-close');
    expect(closeRes.data.status).toBe('CLOSED');
    expect(closeRes.data.closedAt).toBeDefined();

    // E. List NCRs
    const ncrList = await ncrService.listNcrs(qc);
    expect(ncrList.some((n) => n.id === ncrId)).toBe(true);
  });

  // -----------------------------------------------------------------
  // 4. Approved Material Substitutes (MAT-04)
  // -----------------------------------------------------------------
  it('registers approved material substitute and rejects invalid identical substitution', async () => {
    const owner = fixture.alpha.users.owner.principal;

    // A. Reject identical item substitution
    await expect(
      substituteService.registerMaterialSubstitute(
        owner,
        {
          originalItemId: fixture.alpha.masters.rawItemId,
          substituteItemId: fixture.alpha.masters.rawItemId,
          reason: 'Invalid identical substitute',
        },
        'idemp-sub-fail-identical'
      )
    ).rejects.toThrowError(BadRequestError);

    // B. Register valid substitute (AL6063 for AL6061)
    const subRes = await substituteService.registerMaterialSubstitute(
      owner,
      {
        originalItemId: fixture.alpha.masters.rawItemId,
        substituteItemId: subItemId,
        conversionRatioAtoms: 1000000n, // 1:1
        scope: 'GLOBAL',
        reason: 'Alloy 6063 has equivalent yield strength for non-structural brackets',
      },
      'idemp-sub-p8-create'
    );

    expect(subRes.data.isActive).toBe(true);
    expect(subRes.data.originalItem.code).toBe('RAW-AL6061-ROD');
    expect(subRes.data.substituteItem.code).toBe('RAW-AL6063-ROD');

    // C. List substitutes
    const subList = await substituteService.listMaterialSubstitutes(owner, fixture.alpha.masters.rawItemId);
    expect(subList.length).toBeGreaterThanOrEqual(1);

    // D. Deactivate substitute
    const deactRes = await substituteService.deactivateMaterialSubstitute(owner, subRes.data.id, 'idemp-sub-p8-deact');
    expect(deactRes.data.isActive).toBe(false);
  });

  // -----------------------------------------------------------------
  // 5. Versioned Published Master Schedule Revisions (SCH-06)
  // -----------------------------------------------------------------
  it('publishes authoritative schedule revision and supersedes previous revisions', async () => {
    const planner = fixture.alpha.users.planner.principal;

    const periodStart = '2026-11-15T00:00:00.000Z';
    const periodEnd = '2026-11-22T23:59:59.000Z';

    // A. Publish Schedule Revision 1
    const rev1Res = await scheduleService.publishSchedule(
      planner,
      {
        title: 'Master Weekly Production Schedule Week 47',
        periodStart,
        periodEnd,
      },
      'idemp-sched-p8-rev1'
    );

    expect(rev1Res.data.status).toBe('PUBLISHED');
    expect(rev1Res.data.revisionNumber).toBe(1);

    // B. Publish Schedule Revision 2 for same period -> rev 1 is SUPERSEDED
    const rev2Res = await scheduleService.publishSchedule(
      planner,
      {
        title: 'Master Weekly Production Schedule Week 47 (Revision B)',
        periodStart,
        periodEnd,
      },
      'idemp-sched-p8-rev2'
    );

    expect(rev2Res.data.status).toBe('PUBLISHED');
    expect(rev2Res.data.revisionNumber).toBe(2);

    // Verify revision 1 was superseded
    const rev1Db = await fixture.db.publishedSchedule.findUniqueOrThrow({
      where: { id: rev1Res.data.id },
    });
    expect(rev1Db.status).toBe('SUPERSEDED');

    // C. List history
    const history = await scheduleService.getPublishedSchedules(planner);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].revisionNumber).toBe(2);
  });
});
