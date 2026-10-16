import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { PrismaClient } from '@prisma/client';
import { POST as postWorkflow, GET as getWorkflows } from '@/app/api/workflows/route';
import { POST as postWorkflowVersion } from '@/app/api/workflows/[id]/versions/route';
import { PUT as putWorkflowVersion, GET as getWorkflowVersion } from '@/app/api/workflows/[id]/versions/[versionId]/route';
import { POST as postWorkflowVersionAction } from '@/app/api/workflows/[id]/versions/[versionId]/actions/route';
import { POST as postOrder, GET as getOrders } from '@/app/api/orders/route';
import { GET as getOrder } from '@/app/api/orders/[id]/route';
import { POST as postOrderQuestion } from '@/app/api/orders/[id]/questions/route';
import { PUT as putOrderQuestion } from '@/app/api/orders/[id]/questions/[questionId]/route';
import { PUT as putEngRev, GET as getEngRev } from '@/app/api/orders/[id]/engineering/[revId]/route';
import { POST as postEngRevAction } from '@/app/api/orders/[id]/engineering/[revId]/actions/route';
import { POST as postOrderRelease } from '@/app/api/orders/[id]/release/route';

describe('W05: Order Intake, Engineering Review & Workflow Release E2E Walkthrough', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('completes full flow from workflow definition to engineering review, question resolution, and released production tasks', async () => {
    const ownerHeaders = fixture.alpha.users.owner.headers;
    const engineerHeaders = fixture.alpha.users.owner.headers;

    // 1. Create a Workflow Template
    const tplReq = new NextRequest('http://localhost:3000/api/workflows', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        code: 'WF-E2E-AERO-01',
        name: 'Aerospace Machining & Inspection Routing',
        description: 'Complete 3-step routing with turning, milling, and visual inspection',
        orderTypeId: fixture.alpha.masters.orderTypeId,
      }),
    });
    const tplRes = await postWorkflow(tplReq);
    expect(tplRes.status).toBe(201);
    const tplJson = await tplRes.json();
    const templateId = tplJson.data.id;
    const initialVersionId = tplJson.data.initialVersionId;

    // 2. Author routing nodes and edges on the draft version
    const routingDefinition = {
      schemaVersion: 1,
      nodes: [
        {
          key: 'OP-10',
          name: 'CNC Lathe Turning Rough & Finish',
          type: 'OPERATION',
          departmentId: fixture.alpha.masters.departmentId,
          plannedDurationMinutes: 45,
        },
        {
          key: 'OP-20',
          name: '4-Axis CNC Milling Features',
          type: 'OPERATION',
          departmentId: fixture.alpha.masters.departmentId,
          plannedDurationMinutes: 60,
        },
        {
          key: 'QC-30',
          name: 'Final Dimensional & Visual Inspection',
          type: 'INSPECTION',
          departmentId: fixture.alpha.masters.departmentId,
          plannedDurationMinutes: 15,
          formGuard: {
            qcChecklistId: fixture.alpha.masters.qcChecklistId,
            requireSignOff: true,
          },
        },
      ],
      edges: [
        { fromNodeKey: 'OP-10', toNodeKey: 'OP-20', joinPolicy: 'AND' as const },
        { fromNodeKey: 'OP-20', toNodeKey: 'QC-30', joinPolicy: 'AND' as const },
      ],
    };

    const updateVerReq = new NextRequest(
      `http://localhost:3000/api/workflows/${templateId}/versions/${initialVersionId}`,
      {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          expectedVersion: 1,
          definition: routingDefinition,
        }),
      }
    );
    const updateVerRes = await putWorkflowVersion(updateVerReq, {
      params: Promise.resolve({ id: templateId, versionId: initialVersionId }),
    });
    expect(updateVerRes.status).toBe(200);

    // 3. Submit workflow version for review and publish
    const submitWfReq = new NextRequest(
      `http://localhost:3000/api/workflows/${templateId}/versions/${initialVersionId}/actions`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ action: 'submit_review' }),
      }
    );
    const submitWfRes = await postWorkflowVersionAction(submitWfReq, {
      params: Promise.resolve({ id: templateId, versionId: initialVersionId }),
    });
    expect(submitWfRes.status).toBe(200);

    const publishWfReq = new NextRequest(
      `http://localhost:3000/api/workflows/${templateId}/versions/${initialVersionId}/actions`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ action: 'publish' }),
      }
    );
    const publishWfRes = await postWorkflowVersionAction(publishWfReq, {
      params: Promise.resolve({ id: templateId, versionId: initialVersionId }),
    });
    expect(publishWfRes.status).toBe(200);
    const publishedWfJson = await publishWfRes.json();
    expect(publishedWfJson.data.status).toBe('PUBLISHED');
    expect(publishedWfJson.data.definitionHash).toBeDefined();

    // 4. Create Customer Order Draft via Order Intake
    const orderReq = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        customerId: fixture.alpha.masters.customerId,
        orderTypeId: fixture.alpha.masters.orderTypeId,
        itemId: fixture.alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T00:00:00.000Z',
        rfqText: 'Customer RFQ: 10 units titanium brackets. High precision tolerances per ISO 2768-m.',
      }),
    });
    const orderRes = await postOrder(orderReq);
    expect(orderRes.status).toBe(201);
    const orderJson = await orderRes.json();
    const orderId = orderJson.data.id;
    expect(orderJson.data.orderNumber).toMatch(/^ORD-/);
    expect(orderJson.data.status).toBe('DRAFT');

    // 5. Add a customer clarification question
    const qReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}/questions`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        question: 'Surface finish requirement for mating faces: Ra 0.8 or Ra 1.6?',
      }),
    });
    const qRes = await postOrderQuestion(qReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(qRes.status).toBe(201);
    const qJson = await qRes.json();
    expect(qJson.data.question).toContain('Ra 0.8');
    expect(qJson.data.status).toBe('OPEN');

    // 6. Review Engineering Revision: attach BOM lines and bind published workflow version
    const getOrderReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}`, {
      headers: ownerHeaders,
    });
    const orderDetailRes = await getOrder(getOrderReq, {
      params: Promise.resolve({ id: orderId }),
    });
    const orderDetailJson = await orderDetailRes.json();
    const revId = orderDetailJson.data.engineeringRevisions[0].id;
    expect(revId).toBeDefined();

    const mismatchedRevisionReq = new NextRequest(`http://localhost:3000/api/orders/not-the-order/engineering/${revId}`, {
      headers: ownerHeaders,
    });
    const mismatchedRevisionRes = await getEngRev(mismatchedRevisionReq, {
      params: Promise.resolve({ id: 'not-the-order', revId }),
    });
    expect(mismatchedRevisionRes.status).toBe(404);

    const saveEngReq = new NextRequest(
      `http://localhost:3000/api/orders/${orderId}/engineering/${revId}`,
      {
        method: 'PUT',
        headers: engineerHeaders,
        body: JSON.stringify({
          expectedVersion: 1,
          workflowVersionId: initialVersionId,
          specsJson: JSON.stringify({
            toleranceClass: 'ISO 2768-m',
            surfaceTreatment: 'ANODIZE_CLEAR',
            drawingNumber: 'DWG-AERO-2026-X',
          }),
          bomLines: [
            {
              operationNodeKey: 'OP-10',
              itemId: fixture.alpha.masters.rawItemId,
              inputUomId: fixture.alpha.masters.uomPcsId,
              requirementQuantity: '2',
              outputBasis: 1.0,
              allowancePercent: 5.0,
            },
          ],
        }),
      }
    );
    const saveEngRes = await putEngRev(saveEngReq, {
      params: Promise.resolve({ id: orderId, revId }),
    });
    expect(saveEngRes.status).toBe(200);

    // 7. Verify that submitting review fails while critical customer questions remain unresolved
    const prematureSubmitReq = new NextRequest(
      `http://localhost:3000/api/orders/${orderId}/engineering/${revId}/actions`,
      {
        method: 'POST',
        headers: engineerHeaders,
        body: JSON.stringify({ action: 'submit_review' }),
      }
    );
    const prematureSubmitRes = await postEngRevAction(prematureSubmitReq, {
      params: Promise.resolve({ id: orderId, revId }),
    });
    expect(prematureSubmitRes.status).toBe(400);

    // Resolve customer question
    const questionId = qJson.data.id;
    const resolveQReq = new NextRequest(
      `http://localhost:3000/api/orders/${orderId}/questions/${questionId}`,
      {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          answer: 'Ra 0.8 confirmed for all mating surfaces per drawing notes.',
          status: 'ANSWERED',
        }),
      }
    );
    const resolveQRes = await putOrderQuestion(resolveQReq, {
      params: Promise.resolve({ id: orderId, questionId }),
    });
    expect(resolveQRes.status).toBe(200);

    // Now submitting engineering review succeeds
    const submitEngReq = new NextRequest(
      `http://localhost:3000/api/orders/${orderId}/engineering/${revId}/actions`,
      {
        method: 'POST',
        headers: engineerHeaders,
        body: JSON.stringify({ action: 'submit_review' }),
      }
    );
    const submitEngRes = await postEngRevAction(submitEngReq, {
      params: Promise.resolve({ id: orderId, revId }),
    });
    expect(submitEngRes.status).toBe(200);

    const approveEngReq = new NextRequest(
      `http://localhost:3000/api/orders/${orderId}/engineering/${revId}/actions`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ action: 'approve' }),
      }
    );
    const approveEngRes = await postEngRevAction(approveEngReq, {
      params: Promise.resolve({ id: orderId, revId }),
    });
    expect(approveEngRes.status).toBe(200);
    const approvedEngJson = await approveEngRes.json();
    expect(approvedEngJson.data.status).toBe('APPROVED');

    // 8. Release Order to Production
    const releaseReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}/release`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        notes: 'Released to shop floor for schedule execution.',
      }),
    });
    const releaseRes = await postOrderRelease(releaseReq, {
      params: Promise.resolve({ id: orderId }),
    });
    expect(releaseRes.status).toBe(200);
    const releaseJson = await releaseRes.json();

    expect(releaseJson.data.instanceId).toBeDefined();
    expect(releaseJson.data.moId).toBeDefined();
    expect(releaseJson.data.jobsheetId).toBeDefined();
    expect(Object.keys(releaseJson.data.taskIds)).toHaveLength(3); // OP-10, OP-20, QC-30
    expect(releaseJson.data.demandIds).toHaveLength(1); // 25 pcs + 5% allowance = 26.25 raw material

    // 9. Read back order details and verify persisted production state
    const readbackReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}`, {
      headers: ownerHeaders,
    });
    const readbackRes = await getOrder(readbackReq, {
      params: Promise.resolve({ id: orderId }),
    });
    const readbackJson = await readbackRes.json();
    expect(readbackJson.data.status).toBe('RELEASED');
    expect(readbackJson.data.instances).toHaveLength(1);
    expect(readbackJson.data.instances[0].tasks).toHaveLength(3);

    // Initial node OP-10 has no predecessors, so its status is READY
    const op10Task = readbackJson.data.instances[0].tasks.find((t: any) => t.nodeKey === 'OP-10');
    expect(op10Task).toBeDefined();
    expect(op10Task.status).toBe('READY');

    // Downstream OP-20 and QC-30 depend on predecessors, so they start PENDING
    const op20Task = readbackJson.data.instances[0].tasks.find((t: any) => t.nodeKey === 'OP-20');
    expect(op20Task).toBeDefined();
    expect(op20Task.status).toBe('PENDING');

    const qc30Task = readbackJson.data.instances[0].tasks.find((t: any) => t.nodeKey === 'QC-30');
    expect(qc30Task).toBeDefined();
    expect(qc30Task.status).toBe('PENDING');
  });
});
