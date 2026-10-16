import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess, TestAccessResult } from '../fixtures/access';
import { MastersService } from '@/server/modules/masters/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { ForbiddenError, ConflictError, BadRequestError } from '@/domain/errors';

describe('W02: Real Order Drafts and Reviewed Engineering Revisions', () => {
  let testDb: TestDatabase;
  let mastersService: MastersService;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;

  let owner: TestAccessResult;
  let sales: TestAccessResult;
  let engineer: TestAccessResult;
  let customerUser: TestAccessResult;
  let otherCustomerUser: TestAccessResult;

  let uomPcsId: string;
  let uomKgId: string;
  let customerAId: string;
  let customerBId: string;
  let orderTypeId: string;
  let rawItemId: string;
  let fgItemId: string;
  let publishedWfVersionId: string;
  let ungrantedFacilityId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    mastersService = new MastersService(testDb.db);
    workflowService = new WorkflowService(testDb.db);
    orderService = new OrderService(testDb.db);
    engineeringService = new EngineeringService(testDb.db);

    owner = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-ORDERS-TEST',
      email: 'owner@orders.test',
      roles: ['OWNER', 'ENGINEER'],
    });

    sales = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-ORDERS-TEST',
      email: 'sales@orders.test',
      roles: ['SALES'],
    });

    engineer = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-ORDERS-TEST',
      email: 'engineer@orders.test',
      roles: ['ENGINEER'],
    });

    // Masters
    const pcs = await mastersService.createUom(
      owner.principal,
      { code: 'PCS', name: 'Pieces', dimension: 'PIECE', precision: 0 },
      'uom-pcs'
    );
    uomPcsId = pcs.data.id;

    const kg = await mastersService.createUom(
      owner.principal,
      { code: 'KG', name: 'Kilograms', dimension: 'WEIGHT', precision: 3 },
      'uom-kg'
    );
    uomKgId = kg.data.id;

    const custA = await mastersService.createCustomer(
      owner.principal,
      { code: 'CUST-A', name: 'Aerospace Components Inc' },
      'cust-a'
    );
    customerAId = custA.data.id;

    const custB = await mastersService.createCustomer(
      owner.principal,
      { code: 'CUST-B', name: 'Other Client Ltd' },
      'cust-b'
    );
    customerBId = custB.data.id;

    customerUser = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-ORDERS-TEST',
      email: 'rep@aerospace.test',
      roles: ['CUSTOMER'],
      customerId: customerAId,
    });

    otherCustomerUser = await seedTestAccess(testDb.db, {
      workspaceCode: 'WS-ORDERS-TEST',
      email: 'rep@other.test',
      roles: ['CUSTOMER'],
      customerId: customerBId,
    });

    const ot = await mastersService.createOrderType(
      owner.principal,
      { code: 'OT-PRECISION', name: 'Precision Machining' },
      'ot-precision'
    );
    orderTypeId = ot.data.id;

    const raw = await mastersService.createItem(
      owner.principal,
      { code: 'RAW-TITANIUM-BAR', name: 'Titanium Round Bar 50mm', itemType: 'RAW', baseUomId: uomKgId },
      'item-raw'
    );
    rawItemId = raw.data.id;

    const fg = await mastersService.createItem(
      owner.principal,
      { code: 'FG-TURBINE-BLADE', name: 'HP Turbine Blade Gen 3', itemType: 'FINISHED', baseUomId: uomPcsId },
      'item-fg'
    );
    fgItemId = fg.data.id;

    const restrictedFacility = await mastersService.createFacility(
      owner.principal,
      { code: 'FAC-RESTRICTED', name: 'Restricted Facility' },
      'fac-restricted'
    );
    ungrantedFacilityId = restrictedFacility.data.id;

    // Publish a baseline workflow template & version for this order type
    const wfTpl = await workflowService.createTemplate(
      owner.principal,
      { orderTypeId, code: 'WF-TURBINE-01', name: 'Turbine Blade Production' },
      'wf-tpl-turbine'
    );
    const wfV1Id = wfTpl.data.initialVersionId;

    const wfDef = {
      schemaVersion: 1,
      name: 'Turbine Blade Machining and QC',
      nodes: [
        { key: 'OP-10', name: 'CNC Roughing', type: 'OPERATION' as const, plannedDurationMinutes: 90 },
        { key: 'OP-20', name: '5-Axis Finishing', type: 'OPERATION' as const, plannedDurationMinutes: 180 },
        { key: 'QC-30', name: 'CMM Dimensional Inspection', type: 'INSPECTION' as const, plannedDurationMinutes: 60 },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
      ],
    };

    await workflowService.saveVersionDraft(owner.principal, wfV1Id, { definition: wfDef }, 'save-wf-def');
    const pubWf = await workflowService.publishVersion(owner.principal, wfV1Id, 'pub-wf-def');
    publishedWfVersionId = pubWf.data.id;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('creates an order draft with RFQ source and auto-initializes engineering revision 1', async () => {
    const res = await orderService.createOrderDraft(
      sales.principal,
      {
        customerId: customerAId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 25,
        requestedDate: '2026-11-01T00:00:00.000Z',
        promisedDate: '2026-11-05T00:00:00.000Z',
        rfqText: 'Request for 25 units of HP Turbine Blade Gen 3 per drawing rev C.',
        rfqSourceType: 'EMAIL',
      },
      'cmd-order-create-1'
    );

    expect(res.data.orderNumber).toBe('ORD-00001');
    expect(res.data.status).toBe('DRAFT');
    expect(res.data.orderedAtoms.toString()).toBe('25000000'); // 25 units * 1,000,000
    expect(res.data.rfqDrafts.length).toBe(1);
    expect(res.data.rfqDrafts[0].rawText).toContain('drawing rev C');
    expect(res.data.engineeringRevisions.length).toBe(1);
    expect(res.data.engineeringRevisions[0].status).toBe('DRAFT');
    expect(res.data.engineeringRevisions[0].revisionNumber).toBe(1);
    expect(res.data.engineeringRevisions[0].workflowVersionId).toBe(publishedWfVersionId);

    // Replaying same idempotency key returns identical order without duplication
    const replayRes = await orderService.createOrderDraft(
      sales.principal,
      {
        customerId: customerAId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 25,
        requestedDate: '2026-11-01T00:00:00.000Z',
        promisedDate: '2026-11-05T00:00:00.000Z',
        rfqText: 'Request for 25 units of HP Turbine Blade Gen 3 per drawing rev C.',
        rfqSourceType: 'EMAIL',
      },
      'cmd-order-create-1'
    );
    expect(replayRes.data.id).toBe(res.data.id);
  });

  it('rejects creating an order for a facility outside the principal grant', async () => {
    await expect(orderService.createOrderDraft(
      sales.principal,
      {
        customerId: customerAId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 1,
        requestedDate: '2026-11-01T00:00:00.000Z',
        facilityId: ungrantedFacilityId,
      },
      'cmd-order-ungranted-facility'
    )).rejects.toThrow(ForbiddenError);
  });

  it('rejects quantities with more precision than the item unit allows', async () => {
    await expect(orderService.createOrderDraft(
      sales.principal,
      {
        customerId: customerAId,
        orderTypeId,
        itemId: fgItemId,
        orderedQuantity: 1.000001,
        requestedDate: '2026-11-01T00:00:00.000Z',
      },
      'cmd-order-fractional-piece'
    )).rejects.toThrow();
  });

  it('enforces customer scoping for customer portal users', async () => {
    const order = await testDb.db.order.findFirst({
      where: { orderNumber: 'ORD-00001' },
    });

    // Customer A rep can view own order
    const readback = await orderService.getOrder(customerUser.principal, order!.id);
    expect(readback.id).toBe(order!.id);

    // Customer B rep is denied access
    await expect(
      orderService.getOrder(otherCustomerUser.principal, order!.id)
    ).rejects.toThrow(ForbiddenError);
  });

  it('attaches and resolves customer questions, blocking engineering review if open', async () => {
    const order = await testDb.db.order.findFirst({
      where: { orderNumber: 'ORD-00001' },
      include: { engineeringRevisions: true },
    });
    const revId = order!.engineeringRevisions[0].id;

    // Add customer question
    const qRes = await orderService.addCustomerQuestion(
      sales.principal,
      order!.id,
      { question: 'Is material test report (MTR) required with shipment?' },
      'cmd-q-1'
    );
    expect(qRes.data.status).toBe('OPEN');

    // Attempting to submit engineering review while question is OPEN fails
    await expect(
      engineeringService.submitEngineeringReview(engineer.principal, revId, 'cmd-eng-sub-fail')
    ).rejects.toThrow(BadRequestError);

    // Resolve question
    await orderService.resolveCustomerQuestion(
      sales.principal,
      qRes.data.id,
      { answer: 'Confirmed: MTR and CoC required for aerospace standard.', status: 'ANSWERED' },
      'cmd-q-resolve-1'
    );

    // Now submit review succeeds
    const reviewRes = await engineeringService.submitEngineeringReview(
      engineer.principal,
      revId,
      'cmd-eng-sub-success'
    );
    expect(reviewRes.data.status).toBe('REVIEW');
  });

  it('saves reviewed BOM quantities, validates master references, and enforces approval immutability', async () => {
    const order = await testDb.db.order.findFirst({
      where: { orderNumber: 'ORD-00001' },
      include: { engineeringRevisions: true },
    });
    const revId = order!.engineeringRevisions[0].id;

    // Put back into draft to edit BOM
    await testDb.db.engineeringRevision.update({
      where: { id: revId },
      data: { status: 'DRAFT' },
    });

    // 1. Invalid operation node key rejection
    await expect(
      engineeringService.saveEngineeringDraft(
        engineer.principal,
        revId,
        {
          workflowVersionId: publishedWfVersionId,
          bomLines: [
            {
              operationNodeKey: 'OP-NON-EXISTENT',
              itemId: rawItemId,
              inputUomId: uomKgId,
              requirementQuantity: 1.5,
            },
          ],
        },
        'cmd-bom-invalid-node'
      )
    ).rejects.toThrow(BadRequestError);

    // 2. Valid BOM line configuration (1.2 kg Titanium per 1 finished blade)
    const saveRes = await engineeringService.saveEngineeringDraft(
      engineer.principal,
      revId,
      {
        workflowVersionId: publishedWfVersionId,
        outputBasis: 1,
        specs: {
          drawingNumber: 'DWG-TB-2026-C',
          heatTreatmentSpec: 'AMS 4928',
        },
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: rawItemId,
            inputUomId: uomKgId,
            requirementQuantity: '1.250',
            outputBasis: 1,
            allowancePercent: '5.00',
          },
        ],
      },
      'cmd-bom-valid'
    );

    expect(saveRes.data.bomLines.length).toBe(1);
    expect(saveRes.data.bomLines[0].requirementAtoms.toString()).toBe('1250000'); // 1.25 kg * 1,000,000
    expect(saveRes.data.bomLines[0].allowancePercent).toBe(5.0);

    // Submit and Approve
    await engineeringService.submitEngineeringReview(engineer.principal, revId, 'cmd-eng-review-2');

    // Only OWNER can approve
    await expect(
      engineeringService.approveEngineeringRevision(engineer.principal, revId, 'cmd-eng-approve-denied')
    ).rejects.toThrow(ForbiddenError);

    const approveRes = await engineeringService.approveEngineeringRevision(
      owner.principal,
      revId,
      'cmd-eng-approve-success'
    );
    expect(approveRes.data.status).toBe('APPROVED');
    expect(approveRes.data.approvedById).toBe(owner.principal.userId);

    // Order status is now advanced to READY
    const updatedOrder = await orderService.getOrder(owner.principal, order!.id);
    expect(updatedOrder.status).toBe('READY');

    // Approved revision is immutable
    await expect(
      engineeringService.saveEngineeringDraft(
        engineer.principal,
        revId,
        {
          workflowVersionId: publishedWfVersionId,
          bomLines: [],
        },
        'cmd-bom-modify-approved'
      )
    ).rejects.toThrow(ConflictError);
  });
});
