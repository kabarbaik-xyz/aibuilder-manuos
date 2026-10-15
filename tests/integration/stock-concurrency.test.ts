import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { InventoryService } from '@/server/modules/inventory/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { PrismaClient } from '@prisma/client';

describe('O03 — Stock Concurrency & Race Protection', () => {
  let fixture: FactoryFixture;
  let invService1: InventoryService;
  let invService2: InventoryService;
  let dbConnection2: PrismaClient;

  let demand1Id: string;
  let demand2Id: string;
  let lotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    invService1 = new InventoryService(fixture.db);

    // Create an independent database client connection to the same SQLite database
    dbConnection2 = new PrismaClient({
      datasources: {
        db: {
          url: fixture.url,
        },
      },
    });
    await dbConnection2.$connect();
    invService2 = new InventoryService(dbConnection2);

    const ws = fixture.alpha;

    // 1. Post initial raw material stock: exactly 100 units (100,000,000 atoms)
    await invService1.postOpeningBalance(
      ws.users.owner.principal,
      {
        itemId: ws.masters.rawItemId,
        locationId: ws.masters.rawLocationId,
        lotNumber: 'LOT-RACE-01',
        atoms: 100_000_000n,
      },
      'idem-opening-race'
    );

    const lot = await fixture.db.lot.findFirst({
      where: { workspaceId: ws.workspaceId, lotNumber: 'LOT-RACE-01' },
    });
    lotId = lot!.id;

    // 2. Setup Order 1 and Order 2, each requiring raw material
    const orderService = new OrderService(fixture.db);
    const engService = new EngineeringService(fixture.db);
    const wfService = new WorkflowService(fixture.db);

    const tmplRes = await wfService.createTemplate(
      ws.users.owner.principal,
      {
        orderTypeId: ws.masters.orderTypeId,
        code: 'WF-RACE-01',
        name: 'Race Routing',
      },
      'cmd-wf-race-tmpl'
    );
    const wfVersionId = tmplRes.data.initialVersionId;

    await wfService.saveVersionDraft(
      ws.users.owner.principal,
      wfVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Race Routing',
          nodes: [
            {
              key: 'OP-RACE',
              name: 'Race Operation',
              type: 'OPERATION',
              departmentId: ws.masters.departmentId,
              plannedDurationMinutes: 30,
            },
          ],
          edges: [],
        },
      },
      'cmd-wf-race-save'
    );

    await wfService.publishVersion(
      ws.users.owner.principal,
      wfVersionId,
      'cmd-wf-race-pub'
    );

    // Order 1
    const order1 = await orderService.createOrderDraft(
      ws.users.owner.principal,
      {
        customerId: ws.masters.customerId,
        orderTypeId: ws.masters.orderTypeId,
        itemId: ws.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-01T00:00:00.000Z',
      },
      'idem-order-race-1'
    );
    const rev1 = order1.data.engineeringRevisions[0];
    await engService.saveEngineeringDraft(
      ws.users.owner.principal,
      rev1.id,
      {
        workflowVersionId: wfVersionId,
        bomLines: [
          {
            itemId: ws.masters.rawItemId,
            inputUomId: ws.masters.uomPcsId,
            operationNodeKey: 'OP-RACE',
            requirementQuantity: 6,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'idem-eng-race-1'
    );
    await engService.approveEngineeringRevision(
      ws.users.owner.principal,
      rev1.id,
      'idem-app-race-1'
    );
    const rel1 = await releaseOrder(
      ws.users.owner.principal,
      order1.data.id,
      'idem-rel-race-1',
      fixture.db
    );
    demand1Id = rel1.data.demandIds[0];

    // Order 2
    const order2 = await orderService.createOrderDraft(
      ws.users.owner.principal,
      {
        customerId: ws.masters.customerId,
        orderTypeId: ws.masters.orderTypeId,
        itemId: ws.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-01T00:00:00.000Z',
      },
      'idem-order-race-2'
    );
    const rev2 = order2.data.engineeringRevisions[0];
    await engService.saveEngineeringDraft(
      ws.users.owner.principal,
      rev2.id,
      {
        workflowVersionId: wfVersionId,
        bomLines: [
          {
            itemId: ws.masters.rawItemId,
            inputUomId: ws.masters.uomPcsId,
            operationNodeKey: 'OP-RACE',
            requirementQuantity: 6,
            outputBasis: 1,
            allowancePercent: 0,
          },
        ],
      },
      'idem-eng-race-2'
    );
    await engService.approveEngineeringRevision(
      ws.users.owner.principal,
      rev2.id,
      'idem-app-race-2'
    );
    const rel2 = await releaseOrder(
      ws.users.owner.principal,
      order2.data.id,
      'idem-rel-race-2',
      fixture.db
    );
    demand2Id = rel2.data.demandIds[0];
  });

  afterAll(async () => {
    await dbConnection2.$disconnect();
    await fixture.close();
  });

  it('competes two independent connections attempting to reserve 60 from 100 on-hand: total reserved cannot exceed 100', async () => {
    const ws = fixture.alpha;

    // Both connections fire at the same time trying to reserve 60 units (60,000,000 atoms) each from 100 available.
    // Total attempted = 120 > 100. Exactly one must succeed and one must fail.
    const results = await Promise.allSettled([
      invService1.reserveStock(
        ws.users.planner.principal,
        {
          demandId: demand1Id,
          locationId: ws.masters.rawLocationId,
          lotId,
          atoms: '60000000',
          notes: 'Concurrent race request 1',
        },
        'idem-race-req-1'
      ),
      invService2.reserveStock(
        ws.users.planner.principal,
        {
          demandId: demand2Id,
          locationId: ws.masters.rawLocationId,
          lotId,
          atoms: '60000000',
          notes: 'Concurrent race request 2',
        },
        'idem-race-req-2'
      ),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Invariant: Exactly one succeeded and one was rejected
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Read back actual database state: total reserved MUST be exactly 60, never 120
    const balances = await invService1.getBalances(ws.users.planner.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.rawLocationId,
    });

    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(100000000n);
    expect(balances[0].reservedAtoms).toBe(60000000n);
    expect(balances[0].availableAtoms).toBe(40000000n);

    // Sum of active reservations in database must be exactly 60,000,000
    const allReservations = await fixture.db.stockReservation.findMany({
      where: {
        workspaceId: ws.workspaceId,
        status: 'ACTIVE',
      },
    });

    const totalActiveReserved = allReservations.reduce((acc, r) => acc + r.reservedAtoms, 0n);
    expect(totalActiveReserved).toBe(60000000n);
  });
});
