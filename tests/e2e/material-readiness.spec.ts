import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { GET as getBalances } from '@/app/api/inventory/balances/route';
import { GET as getMovements } from '@/app/api/inventory/movements/route';
import { GET as listReservations, POST as postReservation } from '@/app/api/inventory/reservations/route';
import { POST as postIssue } from '@/app/api/inventory/issues/route';
import { GET as getReadiness } from '@/app/api/inventory/readiness/[taskId]/route';
import { GET as listCounts, POST as createCount } from '@/app/api/inventory/counts/route';
import { POST as approveCount } from '@/app/api/inventory/counts/[id]/approve/route';
import { InventoryService } from '@/server/modules/inventory/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { reconcileStock } from '@/server/modules/inventory/ledger';

describe('O04 E2E: Material Readiness & Stock Lifecycle', () => {
  let fixture: FactoryFixture;
  let invService: InventoryService;
  let orderService: OrderService;
  let engService: EngineeringService;
  let wfService: WorkflowService;

  let rawItemId: string;
  let rawLocationId: string;
  let wipLocationId: string;
  let orderId: string;
  let demandId: string;
  let taskId: string;
  let lotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    invService = new InventoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engService = new EngineeringService(fixture.db);
    wfService = new WorkflowService(fixture.db);

    const ws = fixture.alpha;
    rawItemId = ws.masters.rawItemId;
    rawLocationId = ws.masters.rawLocationId;
    wipLocationId = ws.masters.wipLocationId;

    // 1. Post initial opening stock of 100 units
    await invService.postOpeningBalance(
      ws.users.owner.principal,
      {
        itemId: rawItemId,
        locationId: rawLocationId,
        lotNumber: 'LOT-E2E-READINESS-01',
        atoms: 100_000_000n,
        notes: 'Opening stock for E2E readiness',
      },
      'idem-e2e-opening'
    );

    const lot = await fixture.db.lot.findFirst({
      where: { workspaceId: ws.workspaceId, lotNumber: 'LOT-E2E-READINESS-01' },
    });
    lotId = lot!.id;

    // 2. Create order for 10 finished goods
    const orderRes = await orderService.createOrderDraft(
      ws.users.owner.principal,
      {
        customerId: ws.masters.customerId,
        orderTypeId: ws.masters.orderTypeId,
        itemId: ws.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-05T00:00:00.000Z',
      },
      'idem-e2e-order'
    );
    orderId = orderRes.data.id;

    // 3. Create workflow & BOM (6 raw per 1 FG -> 60 raw units required)
    const tmplRes = await wfService.createTemplate(
      ws.users.owner.principal,
      {
        orderTypeId: ws.masters.orderTypeId,
        code: 'WF-E2E-READINESS',
        name: 'E2E Readiness Routing',
      },
      'cmd-e2e-wf-tmpl'
    );
    const wfVersionId = tmplRes.data.initialVersionId;

    await wfService.saveVersionDraft(
      ws.users.owner.principal,
      wfVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'E2E Routing',
          nodes: [
            {
              key: 'OP10-PREP',
              name: 'Material Preparation',
              type: 'OPERATION',
              departmentId: ws.masters.departmentId,
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'cmd-e2e-wf-save'
    );
    await wfService.publishVersion(ws.users.owner.principal, wfVersionId, 'cmd-e2e-wf-pub');

    const initialRev = orderRes.data.engineeringRevisions[0];
    await engService.saveEngineeringDraft(
      ws.users.owner.principal,
      initialRev.id,
      {
        workflowVersionId: wfVersionId,
        bomLines: [
          {
            itemId: rawItemId,
            inputUomId: ws.masters.uomPcsId,
            operationNodeKey: 'OP10-PREP',
            requirementQuantity: 6, // 6 raw per FG
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'idem-e2e-eng-save'
    );
    await engService.approveEngineeringRevision(ws.users.owner.principal, initialRev.id, 'idem-e2e-eng-appr');

    const released = await releaseOrder(ws.users.owner.principal, orderId, 'idem-e2e-rel', fixture.db);
    demandId = released.data.demandIds[0];
    taskId = released.data.taskIds['OP10-PREP'];
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('serves inventory balances and verifies unallocated initial readiness', async () => {
    const ws = fixture.alpha;

    // 1. Query balances endpoint
    const balReq = new NextRequest('http://localhost:3000/api/inventory/balances', {
      headers: ws.users.warehouse.headers,
    });
    const balRes = await getBalances(balReq);
    expect(balRes.status).toBe(200);
    const balJson = await balRes.json();
    expect(balJson.data.length).toBeGreaterThan(0);
    const rawBal = balJson.data.find((b: any) => b.itemId === rawItemId);
    expect(rawBal).toBeTruthy();
    expect(rawBal.onHandAtoms).toBe(100_000_000n.toString());
    expect(rawBal.availableAtoms).toBe(100_000_000n.toString());

    // 2. Query material readiness endpoint for the released task
    const readyReq = new NextRequest(`http://localhost:3000/api/inventory/readiness/${taskId}`, {
      headers: ws.users.planner.headers,
    });
    const readyRes = await getReadiness(readyReq, { params: Promise.resolve({ taskId }) });
    expect(readyRes.status).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.data.taskId).toBe(taskId);
    expect(readyJson.data.isFullyAllocated).toBe(false);
    expect(readyJson.data.isFullyIssued).toBe(false);
    expect(readyJson.data.demands[0].requiredAtoms).toBe(60_000_000n.toString());
    expect(readyJson.data.demands[0].reservedAtoms).toBe('0');
  });

  it('posts hard reservation and verifies readiness transitions to allocated', async () => {
    const ws = fixture.alpha;

    // 1. Post reservation via HTTP POST endpoint
    const reserveHeaders = new Headers(ws.users.planner.headers);
    reserveHeaders.set('Content-Type', 'application/json');
    reserveHeaders.set('Idempotency-Key', 'e2e-reserve-01');

    const reserveReq = new NextRequest('http://localhost:3000/api/inventory/reservations', {
      method: 'POST',
      headers: reserveHeaders,
      body: JSON.stringify({
        demandId,
        locationId: rawLocationId,
        lotId,
        atoms: 60_000_000, // 60 units
      }),
    });
    const reserveRes = await postReservation(reserveReq);
    expect(reserveRes.status).toBe(201);

    // 2. Readiness now reports fully allocated
    const readyReq = new NextRequest(`http://localhost:3000/api/inventory/readiness/${taskId}`, {
      headers: ws.users.planner.headers,
    });
    const readyRes = await getReadiness(readyReq, { params: Promise.resolve({ taskId }) });
    const readyJson = await readyRes.json();
    expect(readyJson.data.isFullyAllocated).toBe(true);
    expect(readyJson.data.isFullyIssued).toBe(false);
    expect(readyJson.data.demands[0].reservedAtoms).toBe(60_000_000n.toString());
  });

  it('issues reserved material to WIP and verifies readiness transitions to fully issued', async () => {
    const ws = fixture.alpha;

    // 1. Post issue via HTTP POST endpoint
    const issueHeaders = new Headers(ws.users.warehouse.headers);
    issueHeaders.set('Content-Type', 'application/json');
    issueHeaders.set('Idempotency-Key', 'e2e-issue-01');

    const issueReq = new NextRequest('http://localhost:3000/api/inventory/issues', {
      method: 'POST',
      headers: issueHeaders,
      body: JSON.stringify({
        demandId,
        sourceLocationId: rawLocationId,
        wipLocationId,
        sourceLotId: lotId,
        atoms: 60_000_000,
      }),
    });
    const issueRes = await postIssue(issueReq);
    expect(issueRes.status).toBe(201);

    // 2. Readiness now reports fully issued
    const readyReq = new NextRequest(`http://localhost:3000/api/inventory/readiness/${taskId}`, {
      headers: ws.users.planner.headers,
    });
    const readyRes = await getReadiness(readyReq, { params: Promise.resolve({ taskId }) });
    const readyJson = await readyRes.json();
    expect(readyJson.data.isFullyIssued).toBe(true);
    expect(readyJson.data.demands[0].reservedAtoms).toBe('0'); // reservation released on issue
    expect(readyJson.data.demands[0].issuedAtoms).toBe(60_000_000n.toString());

    // 3. Raw balance is now 40 on-hand, WIP balance is 60 on-hand
    const rawBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(rawBal[0].onHandAtoms).toBe(40_000_000n);

    const wipBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: wipLocationId,
    });
    expect(wipBal[0].onHandAtoms).toBe(60_000_000n);
  });

  it('submits and approves physical count and verifies final reconciliation', async () => {
    const ws = fixture.alpha;

    // 1. Warehouse conducts count on Raw location: counts 42 units (surplus of 2)
    const countHeaders = new Headers(ws.users.warehouse.headers);
    countHeaders.set('Content-Type', 'application/json');
    countHeaders.set('Idempotency-Key', 'e2e-count-01');

    const countReq = new NextRequest('http://localhost:3000/api/inventory/counts', {
      method: 'POST',
      headers: countHeaders,
      body: JSON.stringify({
        locationId: rawLocationId,
        reason: 'E2E Cycle Count',
        lines: [
          {
            itemId: rawItemId,
            locationId: rawLocationId,
            lotId,
            countedAtoms: 42_000_000,
          },
        ],
      }),
    });
    const countRes = await createCount(countReq);
    expect(countRes.status).toBe(201);
    const countJson = await countRes.json();
    const countId = countJson.data.id;

    // 2. Owner approves count via HTTP POST
    const appHeaders = new Headers(ws.users.owner.headers);
    appHeaders.set('Idempotency-Key', 'e2e-approve-count-01');

    const appReq = new NextRequest(`http://localhost:3000/api/inventory/counts/${countId}/approve`, {
      method: 'POST',
      headers: appHeaders,
    });
    const appRes = await approveCount(appReq, { params: Promise.resolve({ id: countId }) });
    expect(appRes.status).toBe(200);

    // 3. Verify Raw balance updated to 42
    const rawBal = await invService.getBalances(ws.users.owner.principal, {
      itemId: rawItemId,
      locationId: rawLocationId,
    });
    expect(rawBal[0].onHandAtoms).toBe(42_000_000n);

    // 4. Verify complete stock ledger reconciliation
    const recon = await reconcileStock(fixture.db, ws.workspaceId);
    expect(recon.balanced).toBe(true);
    expect(recon.mismatches).toHaveLength(0);
  });
});
