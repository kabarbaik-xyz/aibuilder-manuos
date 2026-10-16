import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { FormService } from '@/server/modules/forms/service';
import { FormSubmissionService } from '@/server/modules/forms/submissions';
import { assertRequiredFormsFinalized } from '@/server/modules/forms/completion';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { FormDefinition } from '@/domain/forms/types';
import { randomUUID } from 'crypto';

describe('Phase 3: Multi-Item Orders, Bounded Jobs, Released Engineering & Form Gates', () => {
  let fixture: FactoryFixture;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let formService: FormService;
  let submissionService: FormSubmissionService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    formService = new FormService(fixture.db);
    submissionService = new FormSubmissionService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  // -----------------------------------------------------------------
  // 1. Backward Compatibility: Single-Item Legacy Order Draft
  // -----------------------------------------------------------------
  it('creates legacy single-item order draft and auto-provisions OrderLine 1', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const res = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-01T00:00:00.000Z',
      },
      'idemp-phase3-legacy-01'
    );

    const order = res.data;
    expect(order.id).toBeDefined();
    expect(order.orderedAtoms).toBe(10_000_000n);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].lineNumber).toBe(1);
    expect(order.lines[0].itemId).toBe(fixture.alpha.masters.fgItemId);
    expect(order.lines[0].orderedAtoms).toBe(10_000_000n);
    expect(order.lines[0].allocatedAtoms).toBe(0n);
  });

  // -----------------------------------------------------------------
  // 2. Multi-Item Order with Explicit Lines
  // -----------------------------------------------------------------
  it('creates multi-item order with distinct lines, delivery address and contract reference', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const res = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        requestedDate: '2026-11-15T00:00:00.000Z',
        deliveryAddress: 'Hangar 4B, Seletar Aerospace Park, Singapore',
        contractReference: 'CTR-AERO-2026-089',
        lines: [
          {
            itemId: fixture.alpha.masters.fgItemId,
            orderedQuantity: 25,
            unitPriceCents: 450000,
            notes: 'High precision finish required',
          },
          {
            itemId: fixture.alpha.masters.rawItemId,
            orderedQuantity: '100',
            unitPriceCents: 12000,
            notes: 'Raw stock test specimen',
          },
        ],
      },
      'idemp-phase3-multi-01'
    );

    const order = res.data;
    expect(order.deliveryAddress).toBe('Hangar 4B, Seletar Aerospace Park, Singapore');
    expect(order.contractReference).toBe('CTR-AERO-2026-089');
    expect(order.orderedAtoms).toBe(125_000_000n); // Decimal-string input is accepted without numeric coercion.
    expect(order.lines).toHaveLength(2);

    expect(order.lines[0].lineNumber).toBe(1);
    expect(order.lines[0].itemId).toBe(fixture.alpha.masters.fgItemId);
    expect(order.lines[0].orderedAtoms).toBe(25_000_000n);
    expect(order.lines[0].unitPriceCents).toBe(450000n);

    expect(order.lines[1].lineNumber).toBe(2);
    expect(order.lines[1].itemId).toBe(fixture.alpha.masters.rawItemId);
    expect(order.lines[1].orderedAtoms).toBe(100_000_000n);
    expect(order.lines[1].unitPriceCents).toBe(12000n);
    expect(order.engineeringRevisions).toHaveLength(2);
    expect(order.engineeringRevisions.map((revision: { orderLineId: string | null }) => revision.orderLineId).sort()).toEqual(
      order.lines.map((line: { id: string }) => line.id).sort()
    );
  });

  // -----------------------------------------------------------------
  // 3. Dynamic Order Line Addition
  // -----------------------------------------------------------------
  it('adds an order line dynamically and updates order aggregate atoms atomically', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-11-20T00:00:00.000Z',
      },
      'idemp-phase3-addline-order'
    );

    const lineRes = await orderService.addOrderLine(
      owner,
      orderRes.data.id,
      {
        itemId: fixture.alpha.masters.rawItemId,
        orderedQuantity: 15,
        unitPriceCents: 5000,
        notes: 'Line 2 added dynamically',
      },
      'idemp-phase3-addline-line'
    );

    expect(lineRes.data.lineNumber).toBe(2);
    expect(lineRes.data.itemId).toBe(fixture.alpha.masters.rawItemId);
    expect(lineRes.data.orderedAtoms).toBe(15_000_000n);

    // Verify order aggregate was updated
    const fetched = await orderService.getOrder(owner, orderRes.data.id);
    expect(fetched.orderedAtoms).toBe(20_000_000n); // 5 + 15 = 20 * 10^6
    expect(fetched.lines).toHaveLength(2);
    const revisions = await fixture.db.engineeringRevision.findMany({
      where: { workspaceId: owner.workspaceId, orderId: orderRes.data.id },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions.some((revision) => revision.orderLineId === lineRes.data.id)).toBe(true);
  });

  // -----------------------------------------------------------------
  // 4. Order Confirmation Lifecycle
  // -----------------------------------------------------------------
  it('confirms order recording confirmedAt and confirmedById timestamps', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 8,
        requestedDate: '2026-11-25T00:00:00.000Z',
      },
      'idemp-phase3-confirm-order'
    );

    expect(orderRes.data.confirmedAt).toBeNull();

    const confirmedRes = await orderService.confirmOrder(
      owner,
      orderRes.data.id,
      'idemp-phase3-confirm-exec'
    );

    expect(confirmedRes.data.confirmedAt).toBeDefined();
    expect(confirmedRes.data.confirmedById).toBe(owner.userId);
    await expect(
      orderService.allocateJob(
        owner,
        { orderLineId: orderRes.data.lines[0].id, targetQuantity: 1 },
        'idemp-phase3-alloc-after-confirm'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  // -----------------------------------------------------------------
  // 5. Bounded Job Allocation & Split with Remainder
  // -----------------------------------------------------------------
  it('splits order line into bounded jobs, tracks remaining atoms, and rejects over-allocation', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 100, // 100_000_000 atoms
        requestedDate: '2026-12-01T00:00:00.000Z',
      },
      'idemp-phase3-alloc-order'
    );

    const lineId = orderRes.data.lines[0].id;

    // 1. Allocate Job 1: 40 units (40,000,000 atoms)
    const job1Res = await orderService.allocateJob(
      owner,
      {
        orderLineId: lineId,
        targetQuantity: 40,
        departmentId: fixture.alpha.masters.departmentId,
      },
      'idemp-phase3-job-01'
    );

    expect(job1Res.data.manufacturingOrder.targetAtoms).toBe(40_000_000n);
    expect(job1Res.data.manufacturingOrder.status).toBe('DRAFT');
    expect(job1Res.data.orderLine.allocatedAtoms).toBe(40_000_000n);
    expect(job1Res.data.unallocatedAtoms).toBe(60_000_000n);

    // 2. Allocate Job 2: 40 units (40,000,000 atoms)
    const job2Res = await orderService.allocateJob(
      owner,
      {
        orderLineId: lineId,
        targetQuantity: 40,
        departmentId: fixture.alpha.masters.departmentId,
      },
      'idemp-phase3-job-02'
    );

    expect(job2Res.data.manufacturingOrder.targetAtoms).toBe(40_000_000n);
    expect(job2Res.data.orderLine.allocatedAtoms).toBe(80_000_000n);
    expect(job2Res.data.unallocatedAtoms).toBe(20_000_000n);

    // 3. Attempt over-allocation: try to allocate 25 units when only 20 units remain
    await expect(
      orderService.allocateJob(
        owner,
        {
          orderLineId: lineId,
          targetQuantity: 25,
        },
        'idemp-phase3-job-fail'
      )
    ).rejects.toThrowError(BadRequestError);

    // 4. Allocate remaining exactly: 20 units (20,000,000 atoms)
    const job3Res = await orderService.allocateJob(
      owner,
      {
        orderLineId: lineId,
        targetQuantity: 20,
        departmentId: fixture.alpha.masters.departmentId,
      },
      'idemp-phase3-job-03'
    );

    expect(job3Res.data.manufacturingOrder.targetAtoms).toBe(20_000_000n);
    expect(job3Res.data.orderLine.allocatedAtoms).toBe(100_000_000n);
    expect(job3Res.data.unallocatedAtoms).toBe(0n);

    // 5. Subsequent allocation attempts fail because 0 atoms remain
    await expect(
      orderService.allocateJob(
        owner,
        {
          orderLineId: lineId,
          targetQuantity: 1,
        },
        'idemp-phase3-job-exhausted'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  // -----------------------------------------------------------------
  // 6. Drawing Revision Release & Supersession
  // -----------------------------------------------------------------
  it('manages drawing revisions with release, supersession, and engineering draft pinning', async () => {
    const owner = fixture.alpha.users.owner.principal;

    // Create Document records for drawings
    const docA = await fixture.db.document.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        storageKey: `drawings/dwg-001-revA-${randomUUID()}.pdf`,
        fileName: 'DWG-001-RevA.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 204850,
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploadedById: owner.userId,
      },
    });

    const docB = await fixture.db.document.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        storageKey: `drawings/dwg-001-revB-${randomUUID()}.pdf`,
        fileName: 'DWG-001-RevB.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 215400,
        checksumSha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        uploadedById: owner.userId,
      },
    });

    // 1. Release Revision A
    const revARes = await engineeringService.releaseDrawingRevision(
      owner,
      {
        documentId: docA.id,
        itemId: fixture.alpha.masters.fgItemId,
        drawingNumber: 'DWG-FLANGE-001',
        revisionCode: 'A',
        notes: 'Initial production drawing release',
      },
      'idemp-drawing-rev-a'
    );

    expect(revARes.data.status).toBe('RELEASED');
    expect(revARes.data.revisionCode).toBe('A');

    // 2. Release Revision B (supersedes Revision A)
    const revBRes = await engineeringService.releaseDrawingRevision(
      owner,
      {
        documentId: docB.id,
        itemId: fixture.alpha.masters.fgItemId,
        drawingNumber: 'DWG-FLANGE-001',
        revisionCode: 'B',
        notes: 'Tolerance update on chamfer',
      },
      'idemp-drawing-rev-b'
    );

    expect(revBRes.data.status).toBe('RELEASED');
    expect(revBRes.data.revisionCode).toBe('B');

    // Verify Revision A was superseded
    const revAFromDb = await fixture.db.drawingRevision.findUnique({
      where: { id: revARes.data.id },
    });
    expect(revAFromDb?.status).toBe('SUPERSEDED');
    expect(revAFromDb?.supersededAt).toBeDefined();
    expect(revAFromDb?.supersededById).toBe(owner.userId);

    // 3. List Drawing Revisions
    const drawings = await engineeringService.listDrawingRevisions(owner, fixture.alpha.masters.fgItemId);
    expect(drawings.length).toBeGreaterThanOrEqual(2);

    // 4. Pin Released Drawing Revision to an Engineering Revision
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 12,
        requestedDate: '2026-12-10T00:00:00.000Z',
      },
      'idemp-order-drawing-pin'
    );

    const engRevId = orderRes.data.engineeringRevisions[0].id;
    const saveRes = await engineeringService.saveEngineeringDraft(
      owner,
      engRevId,
      {
        drawingRevisionId: revBRes.data.id,
        specs: { materialGrade: 'Aerospace Ti-6Al-4V' },
      },
      'idemp-save-eng-drawing'
    );

    expect(saveRes.data.drawingRevisionId).toBe(revBRes.data.id);

    // 5. Attempting to pin a superseded drawing revision is rejected
    await expect(
      engineeringService.saveEngineeringDraft(
        owner,
        engRevId,
        {
          drawingRevisionId: revARes.data.id, // Rev A is SUPERSEDED
        },
        'idemp-save-superseded'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  // -----------------------------------------------------------------
  // 7. Mandatory Form Evidence Invariant (WFL-04)
  // -----------------------------------------------------------------
  it('strictly rejects domain gate when a required form binding has ZERO instances materialized', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const operator = fixture.alpha.users.operator.principal;

    // 1. Create and publish a mandatory Order Form Template
    const tpl = await formService.createTemplate(owner, {
      code: 'ORDER_SPEC_SIGN_OFF',
      name: 'Order Specification Sign-off Form',
      purpose: 'ORDER_SPEC',
    });

    const def: FormDefinition = {
      schemaVersion: 1,
      purpose: 'ORDER_SPEC',
      fields: [
        {
          key: 'engineering_sign_off',
          label: 'Engineering Sign-off',
          kind: 'text',
          required: true,
        },
      ],
    };

    await formService.updateDraftVersion(owner, tpl.templateId, tpl.versionId, {
      expectedVersion: 1,
      definition: def,
    });

    await formService.publishFormVersion(owner, {
      templateId: tpl.templateId,
      versionId: tpl.versionId,
      expectedVersion: 2,
    });

    // 2. Bind form to OrderType with required: true
    const binding = await formService.bindFormVersion(owner, {
      formVersionId: tpl.versionId,
      context: 'ORDER_TYPE',
      orderTypeId: fixture.alpha.masters.orderTypeId,
      required: true,
    });
    expect(binding.bindingId).toBeDefined();

    // 3. Create an order with this OrderType (NO form instance created yet)
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 5,
        requestedDate: '2026-12-15T00:00:00.000Z',
      },
      'idemp-order-wfl04-test'
    );

    const orderId = orderRes.data.id;

    // 4. Assert gate FAILS because required form has 0 instances
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'ORDER',
          subjectId: orderId,
        });
      })
    ).rejects.toThrowError(BadRequestError);

    // 5. Materialize the form instance in PENDING status
    const { instanceId } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: tpl.versionId,
        formBindingId: binding.bindingId,
        subjectType: 'ORDER',
        subjectId: orderId,
      });
    });

    // 6. Gate still fails because status is PENDING (not SUBMITTED)
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'ORDER',
          subjectId: orderId,
        });
      })
    ).rejects.toThrowError(BadRequestError);

    // 7. Finalize the form instance with valid answers
    await submissionService.finalizeSubmission(owner, {
      instanceId,
      expectedVersion: 1,
      answers: {
        engineering_sign_off: 'Verified by Lead Engineer A. Tan',
      },
    });

    // 8. Gate now passes cleanly!
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'ORDER',
          subjectId: orderId,
        });
      })
    ).resolves.not.toThrow();
  });
});
