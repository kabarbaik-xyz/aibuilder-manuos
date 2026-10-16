import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { POST as postOrder } from '@/app/api/orders/route';
import { POST as releaseOrderRoute } from '@/app/api/orders/[id]/release/route';
import { GET as getShipments, POST as postShipment } from '@/app/api/delivery/shipments/route';
import { POST as dispatchShipmentRoute } from '@/app/api/delivery/shipments/[id]/dispatch/route';
import { POST as confirmDeliveryRoute } from '@/app/api/delivery/shipments/[id]/confirm/route';
import { GET as listInspections, POST as createInspectionRoute } from '@/app/api/quality/inspections/route';
import { POST as finalizeInspectionRoute } from '@/app/api/quality/inspections/[id]/finalize/route';
import { GET as getPortalOrder } from '@/app/api/portal/orders/[id]/route';
import { POST as acknowledgePromiseRoute } from '@/app/api/portal/orders/[id]/acknowledge/route';
import { GET as getPassportRoute } from '@/app/api/passports/[serial]/route';
import { SupplyService } from '@/server/modules/supply/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { recordOutput } from '@/server/modules/execution/output';
import { PassportService } from '@/server/modules/quality/passport';
import { parseQuantity } from '@/domain/quantity';

describe('O09: Full Operational Loop Acceptance E2E', () => {
  let fixture: FactoryFixture;

  let supplyService: SupplyService;
  let workflowService: WorkflowService;
  let engineeringService: EngineeringService;
  let inventoryService: InventoryService;
  let executionService: ExecutionService;
  let passportService: PassportService;

  let orderId: string;
  let orderLineId: string;
  let taskId: string;
  let productionOutputId: string;
  let inspectionId: string;
  let fgLotId: string;
  let shipmentId: string;
  const unitSerial = 'SN-2026-E2E-LOOP-01';

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    supplyService = new SupplyService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    passportService = new PassportService(fixture.db);

    const { alpha } = fixture;

    // 1. Initial Raw Material Supply Receipt: 50 RAW units
    const po = await supplyService.createSupplyOrder(
      alpha.users.buyer.principal,
      {
        supplierId: alpha.masters.supplierId,
        expectedDate: '2026-11-20T00:00:00Z',
        lines: [
          {
            itemId: alpha.masters.rawItemId,
            orderedAtoms: '50000000',
            unitPriceCents: 1500,
          },
        ],
      },
      'key-po-e2e-01'
    );
    await supplyService.approveSupplyOrder(
      alpha.users.owner.principal,
      po.data.id,
      'key-po-e2e-approve'
    );
    await supplyService.receiveSupply(
      alpha.users.warehouse.principal,
      {
        supplyOrderId: po.data.id,
        lines: [
          {
            supplyOrderLineId: po.data.lines[0].id,
            locationId: alpha.masters.rawLocationId,
            receivedAtoms: '50000000',
            lotNumber: 'LOT-RAW-E2E-01',
          },
        ],
      },
      'key-po-e2e-receipt'
    );

    // 2. Workflow Routing and Engineering
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-E2E-LOOP',
        name: 'E2E Routing Flow',
      },
      'key-wf-e2e-tmpl'
    );
    const draft = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'E2E Routing V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'CNC Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'key-wf-e2e-draft'
    );
    const pub = await workflowService.publishVersion(
      alpha.users.owner.principal,
      draft.data.id,
      'key-wf-e2e-pub'
    );

    // 3. Create Order via HTTP POST endpoint
    const orderHeaders = new Headers(alpha.users.owner.headers);
    orderHeaders.set('Content-Type', 'application/json');
    orderHeaders.set('Idempotency-Key', 'cmd-create-order-e2e');

    const orderReq = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: orderHeaders,
      body: JSON.stringify({
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-10T00:00:00Z',
      }),
    });
    const orderRes = await postOrder(orderReq);
    expect(orderRes.status).toBe(201);
    const orderJson = await orderRes.json();
    orderId = orderJson.data.id;
    orderLineId = orderJson.data.lines[0].id;
    const revId = orderJson.data.engineeringRevisions[0].id;

    // Approve BOM
    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revId,
      {
        workflowVersionId: pub.data.id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'key-eng-e2e-draft'
    );
    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revId,
      'key-eng-e2e-approve'
    );

    // Release Order via HTTP POST endpoint
    const releaseReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}/release`, {
      method: 'POST',
      headers: alpha.users.owner.headers,
    });
    const releaseRes = await releaseOrderRoute(releaseReq, { params: Promise.resolve({ id: orderId }) });
    expect(releaseRes.status).toBe(200);
    const releaseJson = await releaseRes.json();
    taskId = releaseJson.data.taskIds['OP-10'];
    expect(taskId).toBeDefined();

    // Issue Raw material to WIP
    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId },
    });
    const rawLot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-E2E-01' },
    });
    const resv = await inventoryService.reserveStock(
      alpha.users.planner.principal,
      {
        demandId: demand!.id,
        locationId: alpha.masters.rawLocationId,
        lotId: rawLot!.id,
        atoms: parseQuantity('10'),
      },
      'key-resv-e2e'
    );
    await inventoryService.issueToProduction(
      alpha.users.warehouse.principal,
      {
        demandId: demand!.id,
        sourceLocationId: alpha.masters.rawLocationId,
        sourceLotId: rawLot!.id,
        wipLocationId: alpha.masters.wipLocationId,
        atoms: parseQuantity('10'),
        reservationId: resv.data.id,
      },
      'key-issue-e2e'
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('executes production output, inspects via QC endpoint, and releases 10 FG units', async () => {
    const { alpha } = fixture;

    // Start Task & Record Output
    await executionService.startTask(
      alpha.users.operator.principal,
      { taskId },
      'key-start-e2e-op'
    );

    const out = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('10'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-E2E-01',
        isFinal: true,
      },
      'key-output-e2e-10'
    );
    productionOutputId = out.data.output.id;

    // Create QC inspection via HTTP POST endpoint
    const createInspHeaders = new Headers(alpha.users.qc.headers);
    createInspHeaders.set('Content-Type', 'application/json');
    createInspHeaders.set('Idempotency-Key', 'cmd-create-insp-e2e');

    const createInspReq = new NextRequest('http://localhost:3000/api/quality/inspections', {
      method: 'POST',
      headers: createInspHeaders,
      body: JSON.stringify({
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: '10000000',
      }),
    });
    const createInspRes = await createInspectionRoute(createInspReq);
    expect(createInspRes.status).toBe(201);
    const inspJson = await createInspRes.json();
    inspectionId = inspJson.data.id;

    // Finalize QC inspection via HTTP POST endpoint (10 units passed)
    const finalizeHeaders = new Headers(alpha.users.qc.headers);
    finalizeHeaders.set('Content-Type', 'application/json');
    finalizeHeaders.set('Idempotency-Key', 'cmd-finalize-insp-e2e');

    const finalizeReq = new NextRequest(
      `http://localhost:3000/api/quality/inspections/${inspectionId}/finalize`,
      {
        method: 'POST',
        headers: finalizeHeaders,
        body: JSON.stringify({
          inspectionId,
          passedAtoms: '10000000',
          reworkAtoms: '0',
          scrappedAtoms: '0',
          disposition: 'PASSED',
          results: [
            {
              checkCode: 'DIM-E2E',
              checkDescription: 'Dimensional check',
              isPassed: true,
            },
          ],
        }),
      }
    );
    const finalizeRes = await finalizeInspectionRoute(finalizeReq, { params: Promise.resolve({ id: inspectionId }) });
    expect(finalizeRes.status).toBe(200);

    // Verify 10 FG units in FG Location
    const fgBals = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.fgLocationId,
    });
    expect(fgBals[0].onHandAtoms).toBe(parseQuantity('10'));

    // Capture stock balance lotId
    const fgBalRec = await fixture.db.stockBalance.findFirst({
      where: {
        workspaceId: alpha.workspaceId,
        itemId: alpha.masters.fgItemId,
        locationId: alpha.masters.fgLocationId,
        onHandAtoms: { gt: 0n },
      },
    });
    fgLotId = fgBalRec?.lotId ?? undefined as any;
  });

  it('allocates, dispatches, and delivers shipment via HTTP endpoints', async () => {
    const { alpha } = fixture;

    // 1. Allocate shipment via HTTP POST
    const allocHeaders = new Headers(alpha.users.warehouse.headers);
    allocHeaders.set('Content-Type', 'application/json');
    allocHeaders.set('Idempotency-Key', 'cmd-alloc-ship-e2e');

    const allocReq = new NextRequest('http://localhost:3000/api/delivery/shipments', {
      method: 'POST',
      headers: allocHeaders,
      body: JSON.stringify({
        orderId,
        lines: [
          {
            orderLineId,
            itemId: alpha.masters.fgItemId,
            lotId: fgLotId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: '10000000',
          },
        ],
        carrierName: 'Precision Logistics',
        trackingNumber: 'TRK-E2E-12345',
      }),
    });
    const allocRes = await postShipment(allocReq);
    expect(allocRes.status).toBe(201);
    const allocJson = await allocRes.json();
    shipmentId = allocJson.data.id;
    expect(allocJson.data.status).toBe('ALLOCATED');

    // 2. Dispatch shipment via HTTP POST
    const dispatchHeaders = new Headers(alpha.users.warehouse.headers);
    dispatchHeaders.set('Content-Type', 'application/json');
    dispatchHeaders.set('Idempotency-Key', 'cmd-dispatch-ship-e2e');

    const dispatchReq = new NextRequest(
      `http://localhost:3000/api/delivery/shipments/${shipmentId}/dispatch`,
      {
        method: 'POST',
        headers: dispatchHeaders,
        body: JSON.stringify({
          shipmentId,
          carrierName: 'Precision Logistics',
          trackingNumber: 'TRK-E2E-12345',
        }),
      }
    );
    const dispatchRes = await dispatchShipmentRoute(dispatchReq, { params: Promise.resolve({ id: shipmentId }) });
    expect(dispatchRes.status).toBe(200);

    // 3. Confirm Delivery via HTTP POST
    const confirmHeaders = new Headers(alpha.users.warehouse.headers);
    confirmHeaders.set('Content-Type', 'application/json');
    confirmHeaders.set('Idempotency-Key', 'cmd-confirm-ship-e2e');

    const confirmReq = new NextRequest(
      `http://localhost:3000/api/delivery/shipments/${shipmentId}/confirm`,
      {
        method: 'POST',
        headers: confirmHeaders,
        body: JSON.stringify({
          shipmentId,
          receivedBy: 'Bob Loading Dock Staff',
          notes: 'Received in good condition',
        }),
      }
    );
    const confirmRes = await confirmDeliveryRoute(confirmReq, { params: Promise.resolve({ id: shipmentId }) });
    expect(confirmRes.status).toBe(200);
    const confirmJson = await confirmRes.json();
    expect(confirmJson.data.status).toBe('DELIVERED');
  });

  it('serves customer portal traceability, acknowledgment, and digital passport via HTTP routes', async () => {
    const { alpha } = fixture;

    // Publish unit digital passport
    await passportService.publishPassport(alpha.users.qc.principal, {
      serialNumber: unitSerial,
      orderId,
      itemId: alpha.masters.fgItemId,
    });

    // 1. Customer views portal order detail via HTTP GET
    const portalReq = new NextRequest(`http://localhost:3000/api/portal/orders/${orderId}`, {
      headers: alpha.users.customerUser.headers,
    });
    const portalRes = await getPortalOrder(portalReq, { params: Promise.resolve({ id: orderId }) });
    expect(portalRes.status).toBe(200);
    const portalJson = await portalRes.json();
    expect(portalJson.data.id).toBe(orderId);
    expect(portalJson.data.lines).toHaveLength(1);
    expect(portalJson.data.lines[0].orderedQuantity).toBe('10');

    // 2. Customer acknowledges delivery plan via HTTP POST
    const ackReq = new NextRequest(`http://localhost:3000/api/portal/orders/${orderId}/acknowledge`, {
      method: 'POST',
      headers: alpha.users.customerUser.headers,
    });
    const ackRes = await acknowledgePromiseRoute(ackReq, { params: Promise.resolve({ id: orderId }) });
    expect(ackRes.status).toBe(200);
    const ackJson = await ackRes.json();
    expect(ackJson.data.customerAcknowledged).toBe(true);

    // 3. Query digital passport via HTTP GET
    const passReq = new NextRequest(`http://localhost:3000/api/passports/${unitSerial}`, {
      headers: alpha.users.customerUser.headers,
    });
    const passRes = await getPassportRoute(passReq, { params: Promise.resolve({ serial: unitSerial }) });
    expect(passRes.status).toBe(200);
    const passJson = await passRes.json();
    const passportData = passJson.data ?? passJson;
    expect(passportData.serialNumber).toBe(unitSerial);
    expect(passportData.status).toBe('RELEASED');
    expect(passportData.digestSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
