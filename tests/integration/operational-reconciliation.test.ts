import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { SupplyService } from '@/server/modules/supply/service';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { InventoryService } from '@/server/modules/inventory/service';
import { ExecutionService } from '@/server/modules/execution/service';
import { recordOutput } from '@/server/modules/execution/output';
import {
  createInspection,
  finalizeInspection,
  authorizeRework,
  recordReinspection,
} from '@/server/modules/quality/service';
import { DeliveryService } from '@/server/modules/delivery/service';
import { DocumentService } from '@/server/modules/documents/service';
import { DocumentRepository } from '@/server/modules/documents/repository';
import { PassportService } from '@/server/modules/quality/passport';
import { PortalService } from '@/server/modules/portal/service';
import { PortalRepository } from '@/server/modules/portal/repository';
import { parseQuantity, formatQuantity } from '@/domain/quantity';

describe('O09: Full Operational Loop & Double-Entry Ledger Reconciliation', () => {
  let fixture: FactoryFixture;

  // Services
  let supplyService: SupplyService;
  let orderService: OrderService;
  let workflowService: WorkflowService;
  let engineeringService: EngineeringService;
  let inventoryService: InventoryService;
  let deliveryService: DeliveryService;
  let documentService: DocumentService;
  let passportService: PassportService;
  let portalService: PortalService;

  let executionService: ExecutionService;

  // Artifact IDs across loop
  let supplyOrderId: string;
  let receivedRawLotId: string;
  let workflowVersionId: string;
  let customerOrderId: string;
  let taskId: string;
  let productionOutputId: string;
  let inspectionId: string;
  let reworkAttemptId: string;
  let reinspectionId: string;
  let fgLotId: string;
  let shipmentId: string;
  const unitSerial = 'SN-2026-LOOP-001';

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    supplyService = new SupplyService(fixture.db);
    orderService = new OrderService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    deliveryService = new DeliveryService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    documentService = new DocumentService(new DocumentRepository(fixture.db), fixture.db);
    passportService = new PassportService(fixture.db);
    portalService = new PortalService(new PortalRepository(fixture.db));
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('Step 1: Purchase Order & Receipt of Raw Materials into Warehouse', async () => {
    const { alpha } = fixture;

    // Buyer creates supply order for 50 RAW units
    const po = await supplyService.createSupplyOrder(
      alpha.users.buyer.principal,
      {
        supplierId: alpha.masters.supplierId,
        expectedDate: '2026-11-20T00:00:00Z',
        lines: [
          {
            itemId: alpha.masters.rawItemId,
            orderedAtoms: '50000000', // 50 units
            unitPriceCents: 1500,
          },
        ],
      },
      'key-po-loop-01'
    );
    supplyOrderId = po.data.id;

    // Owner approves PO
    await supplyService.approveSupplyOrder(
      alpha.users.owner.principal,
      supplyOrderId,
      'key-po-loop-approve'
    );

    // Warehouse receives 50 RAW units into RAW location
    const receipt = await supplyService.receiveSupply(
      alpha.users.warehouse.principal,
      {
        supplyOrderId,
        lines: [
          {
            supplyOrderLineId: po.data.lines[0].id,
            locationId: alpha.masters.rawLocationId,
            receivedAtoms: '50000000',
            lotNumber: 'LOT-RAW-LOOP-01',
          },
        ],
      },
      'key-po-loop-receipt'
    );
    expect(receipt.data.lines[0].receivedAtoms).toBe(parseQuantity('50'));

    const lot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-LOOP-01' },
    });
    expect(lot).toBeDefined();
    receivedRawLotId = lot!.id;

    // Ledger balance verification
    const rawBalances = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.rawLocationId,
    });
    expect(rawBalances[0].onHandAtoms).toBe(parseQuantity('50'));
  });

  it('Step 2: Workflow Definition, Engineering BOM & Customer Order Release', async () => {
    const { alpha } = fixture;

    // Create & Publish Workflow Template
    const wfTmpl = await workflowService.createTemplate(
      alpha.users.owner.principal,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-LOOP-01',
        name: 'Loop Routing OP-10',
      },
      'key-wf-loop-tmpl'
    );

    const draft = await workflowService.saveVersionDraft(
      alpha.users.owner.principal,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Loop Routing V1',
          nodes: [
            {
              key: 'OP-10',
              name: 'Precision Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 45,
            },
          ],
          edges: [],
        },
      },
      'key-wf-loop-draft'
    );

    const pub = await workflowService.publishVersion(
      alpha.users.owner.principal,
      draft.data.id,
      'key-wf-loop-pub'
    );
    workflowVersionId = pub.data.id;

    // Create Customer Order for 10 Finished Goods
    const order = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-28T00:00:00Z',
      },
      'key-order-loop-01'
    );
    customerOrderId = order.data.id;
    const revId = order.data.engineeringRevisions[0].id;

    // Set promised date for customer portal visibility
    await fixture.db.order.update({
      where: { id: customerOrderId },
      data: { promisedDate: new Date('2026-12-01T00:00:00Z') },
    });

    // Configure Engineering BOM Revision (1 RAW = 1 FG)
    await engineeringService.saveEngineeringDraft(
      alpha.users.owner.principal,
      revId,
      {
        workflowVersionId,
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
      'key-eng-loop-draft'
    );

    await engineeringService.approveEngineeringRevision(
      alpha.users.owner.principal,
      revId,
      'key-eng-loop-approve'
    );

    // Release Order -> Demands, MO, Jobsheet, Tasks
    const released = await releaseOrder(
      alpha.users.owner.principal,
      customerOrderId,
      'key-release-loop-01',
      fixture.db
    );
    taskId = released.data.taskIds['OP-10'];
    expect(taskId).toBeDefined();

    // Demand reservation & Issue from RAW to WIP (10 units)
    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId: customerOrderId },
    });
    expect(demand).toBeDefined();

    const reservation = await inventoryService.reserveStock(
      alpha.users.planner.principal,
      {
        demandId: demand!.id,
        locationId: alpha.masters.rawLocationId,
        lotId: receivedRawLotId,
        atoms: parseQuantity('10'),
      },
      'key-reserve-loop-10'
    );

    await inventoryService.issueToProduction(
      alpha.users.warehouse.principal,
      {
        demandId: demand!.id,
        sourceLocationId: alpha.masters.rawLocationId,
        sourceLotId: receivedRawLotId,
        wipLocationId: alpha.masters.wipLocationId,
        atoms: parseQuantity('10'),
        reservationId: reservation.data.id,
      },
      'key-issue-loop-10'
    );

    // Stock verification: Raw location down from 50 to 40, WIP is 10
    const rawLeft = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.rawLocationId,
    });
    expect(rawLeft[0].onHandAtoms).toBe(parseQuantity('40'));

    const wipStock = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.wipLocationId,
    });
    expect(wipStock[0].onHandAtoms).toBe(parseQuantity('10'));
  });

  it('Step 3: Shop Floor Execution & Output Recording into Quarantine', async () => {
    const { alpha } = fixture;

    // Operator starts task
    await executionService.startTask(
      alpha.users.operator.principal,
      { taskId },
      'key-task-start'
    );

    // Operator records 10 output units to Quarantine with lot number
    const outputRes = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('10'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        lotNumber: 'LOT-FG-LOOP-01',
        isFinal: true,
      },
      'key-output-loop-10'
    );
    productionOutputId = outputRes.data.output.id;

    // Verify WIP material was consumed (10 -> 0)
    const wipAfter = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.wipLocationId,
    });
    const wipSum = wipAfter.reduce((s, b) => s + b.onHandAtoms, 0n);
    expect(wipSum).toBe(0n);

    // Quarantine has 10 FG units
    const qBal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.quarantineLocationId,
    });
    expect(qBal[0].onHandAtoms).toBe(parseQuantity('10'));
  });

  it('Step 4: Quality Inspection, Rework & Release to Finished Goods Location', async () => {
    const { alpha } = fixture;

    // 1. Create Inspection for 10 units
    const insp = await createInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: parseQuantity('10'),
      },
      'key-insp-loop-01'
    );
    inspectionId = insp.data.id;

    // 2. Finalize: 8 Passed directly to FG, 2 Rework held in Quarantine
    await finalizeInspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        inspectionId,
        passedAtoms: parseQuantity('8'),
        reworkAtoms: parseQuantity('2'),
        scrappedAtoms: 0n,
        disposition: 'PARTIAL',
        results: [
          {
            checkCode: 'QC-DIM',
            checkDescription: 'Tolerance check',
            isPassed: true,
          },
          {
            checkCode: 'QC-SURF',
            checkDescription: 'Edge finish check',
            isPassed: false,
            defectReason: 'Minor edge burrs on 2 units',
          },
        ],
      },
      'key-finalize-loop-01'
    );

    // Check balances: FG has 8, Quarantine has 2
    const fgBal1 = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.fgLocationId,
    });
    expect(fgBal1[0].onHandAtoms).toBe(parseQuantity('8'));

    // 3. Authorize Rework for 2 units
    const rework = await authorizeRework(
      fixture.db,
      alpha.users.qc.principal,
      {
        inspectionId,
        taskId,
        targetAtoms: parseQuantity('2'),
        instruction: 'Manual edge deburring',
      },
      'key-rework-loop-01'
    );
    reworkAttemptId = rework.data.id;

    // 4. Re-inspect rework units -> 2 Passed to FG
    const reinspect = await recordReinspection(
      fixture.db,
      alpha.users.qc.principal,
      {
        originalInspectionId: inspectionId,
        reworkAttemptId,
        passedAtoms: parseQuantity('2'),
        scrappedAtoms: 0n,
        results: [
          {
            checkCode: 'QC-SURF-RETEST',
            checkDescription: 'Retest edge finish',
            isPassed: true,
          },
        ],
      },
      'key-reinspect-loop-01'
    );
    reinspectionId = reinspect.data.id;

    // Physical conservation invariant check:
    // Total FG on-hand must be EXACTLY 10 units (8 + 2), Quarantine must be 0
    const fgBalFinal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.fgLocationId,
    });
    expect(fgBalFinal[0].onHandAtoms).toBe(parseQuantity('10'));

    const qBalFinal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.quarantineLocationId,
    });
    const qSum = qBalFinal.reduce((s, b) => s + b.onHandAtoms, 0n);
    expect(qSum).toBe(0n);

    // Find exact stockBalance in FG location to use its lotId (or null)
    const fgBalanceRecord = await fixture.db.stockBalance.findFirst({
      where: {
        workspaceId: alpha.workspaceId,
        itemId: alpha.masters.fgItemId,
        locationId: alpha.masters.fgLocationId,
        onHandAtoms: { gt: 0n },
      },
    });
    fgLotId = fgBalanceRecord?.lotId ?? undefined as any;
  });

  it('Step 5: Shipment Allocation, Dispatch & Delivery Confirmation', async () => {
    const { alpha } = fixture;
    const customerOrderLine = await fixture.db.orderLine.findFirstOrThrow({
      where: { workspaceId: alpha.workspaceId, orderId: customerOrderId },
    });

    // 1. Allocate 10 Finished Goods to customer order
    const alloc = await deliveryService.allocateShipment(
      alpha.users.warehouse.principal,
      {
        orderId: customerOrderId,
        lines: [
          {
            orderLineId: customerOrderLine.id,
            itemId: alpha.masters.fgItemId,
            lotId: fgLotId,
            sourceLocationId: alpha.masters.fgLocationId,
            allocatedAtoms: parseQuantity('10'),
          },
        ],
        notes: 'Full order shipment delivery',
      },
      'key-alloc-loop-01'
    );
    shipmentId = alloc.data.id;
    expect(alloc.data.status).toBe('ALLOCATED');

    // 2. Dispatch shipment (consumes FG inventory from warehouse into transit)
    const dispatched = await deliveryService.dispatchShipment(
      alpha.users.warehouse.principal,
      {
        shipmentId,
        carrierName: 'Precision Express',
        trackingNumber: 'TRK-LOOP-9988',
      },
      'key-dispatch-loop-01'
    );
    expect(dispatched.data.status).toBe('DISPATCHED');

    // FG warehouse balance is now 0 on-hand (physical stock departed warehouse)
    const fgWarehouse = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.fgLocationId,
    });
    const fgSum = fgWarehouse.reduce((s, b) => s + b.onHandAtoms, 0n);
    expect(fgSum).toBe(0n);

    // 3. Confirm Delivery to Customer
    const delivered = await deliveryService.confirmDelivery(
      alpha.users.warehouse.principal,
      {
        shipmentId,
        receivedBy: 'Alice Warehouse Receiver',
        notes: 'Delivered in good order to loading dock',
      },
      'key-delivered-loop-01'
    );
    expect(delivered.data.status).toBe('DELIVERED');
    expect(delivered.data.receivedBy).toBe('Alice Warehouse Receiver');
  });

  it('Step 6: Customer Portal Traceability, Evidence Download & Digital Passport', async () => {
    const { alpha } = fixture;

    // 1. Publish unit passport for customer order
    const passportRes = await passportService.publishPassport(alpha.users.qc.principal, {
      serialNumber: unitSerial,
      orderId: customerOrderId,
      itemId: alpha.masters.fgItemId,
    });
    expect(passportRes.serialNumber).toBe(unitSerial);

    // 2. Customer user accesses portal order details
    const portalOrder = await portalService.getCustomerOrder(
      alpha.users.customerUser.principal,
      customerOrderId
    );
    expect(portalOrder.id).toBe(customerOrderId);
    expect(portalOrder.lines[0].orderedQuantity).toBe('10');
    expect(['RELEASED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED']).toContain(portalOrder.status);

    // 3. Customer user acknowledges delivery plan
    const ack = await portalService.acknowledgePromise(
      alpha.users.customerUser.principal,
      customerOrderId
    );
    expect(ack.customerAcknowledged).toBe(true);

    // 4. Customer verifies unit digital passport
    const passport = await passportService.getUnitPassport(
      alpha.users.customerUser.principal,
      unitSerial
    );
    expect(passport.serialNumber).toBe(unitSerial);
    expect(passport.status).toBe('RELEASED');
    expect(passport.order?.id).toBe(customerOrderId);
    expect(passport.digestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Step 7: Full Double-Entry Ledger Mathematical Reconciliation', async () => {
    const { alpha } = fixture;

    // Reconcile complete double-entry stock ledger
    const recon = await inventoryService.reconcile(alpha.users.owner.principal);

    expect(recon.balanced).toBe(true);
    expect(recon.mismatches.length).toBe(0);
    expect(recon.totalMovements).toBeGreaterThanOrEqual(5);

    // Check specific invariants:
    // Raw material: 50 received, 10 issued to WIP -> 40 remaining in RAW warehouse
    const rawBal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.rawLocationId,
    });
    expect(rawBal[0].onHandAtoms).toBe(parseQuantity('40'));

    // WIP location: 10 issued, 10 consumed in milling -> 0 remaining
    const wipBal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.rawItemId,
      locationId: alpha.masters.wipLocationId,
    });
    const wipSum = wipBal.reduce((s, b) => s + b.onHandAtoms, 0n);
    expect(wipSum).toBe(0n);

    // Finished Goods location: 10 produced & inspected, 10 shipped -> 0 remaining in FG warehouse
    const fgBal = await inventoryService.getBalances(alpha.users.owner.principal, {
      itemId: alpha.masters.fgItemId,
      locationId: alpha.masters.fgLocationId,
    });
    const fgSum = fgBal.reduce((s, b) => s + b.onHandAtoms, 0n);
    expect(fgSum).toBe(0n);
  });
});
