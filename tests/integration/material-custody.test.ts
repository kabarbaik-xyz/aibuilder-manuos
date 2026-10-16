import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { InventoryService } from '@/server/modules/inventory/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { parseQuantity } from '@/domain/quantity';
import { ForbiddenError, BadRequestError } from '@/domain/errors';
import { MovementType } from '@/server/modules/inventory/contracts';

describe('O03 — Reservations, WIP Issue/Return and Actual Consumption', () => {
  let fixture: FactoryFixture;
  let invService: InventoryService;
  let orderService: OrderService;
  let engService: EngineeringService;

  let orderId: string;
  let demandId: string;
  let taskId: string;
  let lotId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    invService = new InventoryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engService = new EngineeringService(fixture.db);

    const ws = fixture.alpha;

    // 1. Post initial raw material stock: 100 units (100,000,000 atoms)
    const opening = await invService.postOpeningBalance(
      ws.users.owner.principal,
      {
        itemId: ws.masters.rawItemId,
        locationId: ws.masters.rawLocationId,
        lotNumber: 'LOT-RAW-CUSTODY-01',
        atoms: 100_000_000n, // 100 units
        notes: 'Initial stock for custody testing',
      },
      'idem-opening-custody'
    );

    const lot = await fixture.db.lot.findFirst({
      where: { workspaceId: ws.workspaceId, lotNumber: 'LOT-RAW-CUSTODY-01' },
    });
    lotId = lot!.id;

    // 2. Create Order for 10 finished goods
    const orderRes = await orderService.createOrderDraft(
      ws.users.owner.principal,
      {
        customerId: ws.masters.customerId,
        orderTypeId: ws.masters.orderTypeId,
        itemId: ws.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-12-01T00:00:00.000Z',
      },
      'idem-order-custody'
    );
    orderId = orderRes.data.id;

    // 3. Create published workflow version
    const wfService = new WorkflowService(fixture.db);
    const tmplRes = await wfService.createTemplate(
      ws.users.owner.principal,
      {
        orderTypeId: ws.masters.orderTypeId,
        code: 'WF-CUSTODY-01',
        name: 'Custody Routing',
      },
      'cmd-wf-custody-tmpl'
    );
    const wfVersionId = tmplRes.data.initialVersionId;

    await wfService.saveVersionDraft(
      ws.users.owner.principal,
      wfVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'Custody Routing',
          nodes: [
            {
              key: 'OP10-MACHINING',
              name: 'Rough Machining',
              type: 'OPERATION',
              departmentId: ws.masters.departmentId,
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'cmd-wf-custody-save'
    );

    await wfService.publishVersion(
      ws.users.owner.principal,
      wfVersionId,
      'cmd-wf-custody-pub'
    );

    // 4. Save and approve engineering revision with BOM line: 6 raw per 1 FG
    const initialRev = orderRes.data.engineeringRevisions[0];
    await engService.saveEngineeringDraft(
      ws.users.owner.principal,
      initialRev.id,
      {
        workflowVersionId: wfVersionId,
        bomLines: [
          {
            itemId: ws.masters.rawItemId,
            inputUomId: ws.masters.uomPcsId,
            operationNodeKey: 'OP10-MACHINING',
            requirementQuantity: 6, // 6 units raw per finished good
            outputBasis: 1, // per 1 FG
            allowancePercent: 0,
          },
        ],
      },
      'idem-eng-custody'
    );

    await engService.approveEngineeringRevision(
      ws.users.owner.principal,
      initialRev.id,
      'idem-approve-eng-custody'
    );

    // 5. Release order to production -> generates MaterialDemand
    const released = await releaseOrder(
      ws.users.owner.principal,
      orderId,
      'idem-release-custody',
      fixture.db
    );

    demandId = released.data.demandIds[0];
    taskId = released.data.taskIds['OP10-MACHINING'];
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('defines the reviewed BOM demand in exact base atoms', () => {
    const ordered = parseQuantity('10', 0);
    const rawPerFinished = parseQuantity('6', 0);
    const required = (ordered * rawPerFinished) / 1000000n;
    expect(required).toBe(60000000n);
    expect(parseQuantity('100', 0) - required).toBe(40000000n);
  });

  it('hard reserves eligible actual stock and updates demand status to ALLOCATED', async () => {
    const ws = fixture.alpha;

    // Operator lacks planning.write -> Forbidden
    await expect(
      invService.reserveStock(
        ws.users.operator.principal,
        {
          demandId,
          locationId: ws.masters.rawLocationId,
          lotId,
          atoms: '60000000',
        },
        'idem-res-op-fail'
      )
    ).rejects.toThrow(ForbiddenError);

    // Planner has planning.write -> Success
    const res = await invService.reserveStock(
      ws.users.planner.principal,
      {
        demandId,
        locationId: ws.masters.rawLocationId,
        lotId,
        atoms: '60000000', // exactly 60 units
        notes: 'Hard reserve for Order OP10 Machining',
      },
      'idem-res-planner-01'
    );

    expect(res.data).toBeDefined();
    expect(res.data.status).toBe('ACTIVE');
    expect(res.data.reservedAtoms).toBe(60000000n);

    // Verify balance: onHand = 100, reserved = 60, available = 40
    const balances = await invService.getBalances(ws.users.planner.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.rawLocationId,
    });
    expect(balances.length).toBe(1);
    expect(balances[0].onHandAtoms).toBe(100000000n);
    expect(balances[0].reservedAtoms).toBe(60000000n);
    expect(balances[0].availableAtoms).toBe(40000000n);

    // Verify demand status is now ALLOCATED
    const demand = await fixture.db.materialDemand.findUnique({ where: { id: demandId } });
    expect(demand!.status).toBe('ALLOCATED');
  });

  it('releases reservation, returning available on-hand balance and resetting demand to OPEN', async () => {
    const ws = fixture.alpha;
    const reservations = await invService.listReservations(ws.users.planner.principal, { demandId });
    const activeRes = reservations.find((r) => r.status === 'ACTIVE')!;

    const released = await invService.releaseReservation(
      ws.users.planner.principal,
      activeRes.id,
      'idem-release-res-01'
    );
    expect(released.data.status).toBe('RELEASED');

    // Balance check: reserved = 0, available = 100
    const balances = await invService.getBalances(ws.users.planner.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.rawLocationId,
    });
    expect(balances[0].reservedAtoms).toBe(0n);
    expect(balances[0].availableAtoms).toBe(100000000n);

    // Demand reverts to OPEN
    const demand = await fixture.db.materialDemand.findUnique({ where: { id: demandId } });
    expect(demand!.status).toBe('OPEN');

    // Re-reserve 60 units for subsequent issue flow
    await invService.reserveStock(
      ws.users.planner.principal,
      {
        demandId,
        locationId: ws.masters.rawLocationId,
        lotId,
        atoms: '60000000',
      },
      'idem-re-reserve-01'
    );
  });

  it('issues raw material into WIP location, consuming reservation and updating custody', async () => {
    const ws = fixture.alpha;
    const reservations = await invService.listReservations(ws.users.planner.principal, { demandId });
    const activeRes = reservations.find((r) => r.status === 'ACTIVE')!;

    // Cannot issue from WIP or to non-WIP
    await expect(
      invService.issueToProduction(
        ws.users.warehouse.principal,
        {
          demandId,
          sourceLocationId: ws.masters.rawLocationId,
          sourceLotId: lotId,
          wipLocationId: ws.masters.fgLocationId, // Not WIP!
          atoms: '60000000',
        },
        'idem-issue-invalid-dest'
      )
    ).rejects.toThrow(BadRequestError);

    // A reservation for another demand must never authorize this demand's issue.
    const otherDemand = await fixture.db.materialDemand.create({
      data: {
        workspaceId: ws.workspaceId,
        orderId,
        taskId,
        itemId: ws.masters.rawItemId,
        requiredAtoms: 10_000_000n,
        status: 'OPEN',
      },
    });
    const otherReservation = await invService.reserveStock(
      ws.users.planner.principal,
      {
        demandId: otherDemand.id,
        locationId: ws.masters.rawLocationId,
        lotId,
        atoms: '10000000',
      },
      'idem-res-other-demand'
    );
    await expect(
      invService.issueToProduction(
        ws.users.warehouse.principal,
        {
          demandId,
          sourceLocationId: ws.masters.rawLocationId,
          sourceLotId: lotId,
          wipLocationId: ws.masters.wipLocationId,
          atoms: '10000000',
          reservationId: otherReservation.data.id,
        },
        'idem-issue-cross-demand-reservation'
      )
    ).rejects.toThrow(BadRequestError);
    const preservedOtherReservation = await fixture.db.stockReservation.findUnique({
      where: { id: otherReservation.data.id },
    });
    expect(preservedOtherReservation?.status).toBe('ACTIVE');
    await invService.releaseReservation(
      ws.users.planner.principal,
      otherReservation.data.id,
      'idem-release-other-demand'
    );
    await fixture.db.stockReservation.delete({
      where: { workspaceId_id: { workspaceId: ws.workspaceId, id: otherReservation.data.id } },
    });
    await fixture.db.materialDemand.delete({
      where: { workspaceId_id: { workspaceId: ws.workspaceId, id: otherDemand.id } },
    });

    // Issue 60 units to WIP
    const issueResult = await invService.issueToProduction(
      ws.users.warehouse.principal,
      {
        demandId,
        sourceLocationId: ws.masters.rawLocationId,
        sourceLotId: lotId,
        wipLocationId: ws.masters.wipLocationId,
        atoms: '60000000',
        reservationId: activeRes.id,
        notes: 'Transfer raw bar stock to CNC station stage',
      },
      'idem-issue-wip-01'
    );

    expect(issueResult.data).toBeDefined();
    expect(issueResult.data.movementType).toBe(MovementType.ISSUE_TO_WIP);
    expect(issueResult.data.atoms).toBe(60000000n);

    // Raw balance: onHand dropped to 40, reserved dropped to 0
    const rawBalances = await invService.getBalances(ws.users.warehouse.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.rawLocationId,
    });
    expect(rawBalances[0].onHandAtoms).toBe(40000000n);
    expect(rawBalances[0].reservedAtoms).toBe(0n);
    expect(rawBalances[0].availableAtoms).toBe(40000000n);

    // WIP balance: onHand is now 60
    const wipBalances = await invService.getBalances(ws.users.warehouse.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.wipLocationId,
    });
    expect(wipBalances.length).toBe(1);
    expect(wipBalances[0].onHandAtoms).toBe(60000000n);
    expect(wipBalances[0].lotId).toBe(lotId);

    // Reservation is now CONSUMED
    const updatedRes = await fixture.db.stockReservation.findUnique({ where: { id: activeRes.id } });
    expect(updatedRes!.status).toBe('CONSUMED');

    // Demand status is now ISSUED
    const updatedDemand = await fixture.db.materialDemand.findUnique({ where: { id: demandId } });
    expect(updatedDemand!.status).toBe('ISSUED');
  });

  it('returns unused WIP material back to raw warehouse without inventing supplier receipts', async () => {
    const ws = fixture.alpha;

    // Return 10 units (10,000,000 atoms) from WIP back to Raw Warehouse
    const ret = await invService.returnUnusedMaterial(
      ws.users.warehouse.principal,
      {
        demandId,
        wipLocationId: ws.masters.wipLocationId,
        destinationLocationId: ws.masters.rawLocationId,
        lotId,
        atoms: '10000000',
        notes: 'Excess material returned after machine nesting optimization',
      },
      'idem-return-unused-01'
    );

    expect(ret.data).toBeDefined();
    expect(ret.data.movementType).toBe(MovementType.RETURN_FROM_WIP);
    expect(ret.data.atoms).toBe(10000000n);

    // WIP balance decreased from 60 to 50
    const wipBalances = await invService.getBalances(ws.users.warehouse.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.wipLocationId,
    });
    expect(wipBalances[0].onHandAtoms).toBe(50000000n);

    // Raw balance increased from 40 to 50
    const rawBalances = await invService.getBalances(ws.users.warehouse.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.rawLocationId,
    });
    expect(rawBalances[0].onHandAtoms).toBe(50000000n);
  });

  it('consumes issued WIP into production, ensuring consumed material is not counted as unconsumed WIP', async () => {
    const ws = fixture.alpha;

    // Operator consumes 50 units (all remaining WIP) during task execution
    const consumeRes = await invService.consumeIssuedMaterial(
      ws.users.operator.principal,
      {
        demandId,
        wipLocationId: ws.masters.wipLocationId,
        lotId,
        atoms: '50000000',
        taskId,
        notes: 'Milled 10 parts on Haas VF-2SS',
      },
      'idem-consume-wip-01'
    );

    expect(consumeRes.data).toBeDefined();
    expect(consumeRes.data.movementType).toBe(MovementType.PRODUCTION_CONSUME);
    expect(consumeRes.data.atoms).toBe(50000000n);
    expect(consumeRes.data.destinationLocationId).toBeNull();

    // WIP on-hand is now ZERO
    const wipBalances = await invService.getBalances(ws.users.warehouse.principal, {
      itemId: ws.masters.rawItemId,
      locationId: ws.masters.wipLocationId,
      includeZero: true,
    });
    expect(wipBalances[0].onHandAtoms).toBe(0n);

    // Attempting to consume again fails with insufficient stock
    await expect(
      invService.consumeIssuedMaterial(
        ws.users.operator.principal,
        {
          demandId,
          wipLocationId: ws.masters.wipLocationId,
          lotId,
          atoms: '1000000',
          taskId,
        },
        'idem-consume-fail-over'
      )
    ).rejects.toThrow(BadRequestError);
  });

  it('provides authoritative task material readiness read-model', async () => {
    const ws = fixture.alpha;

    const readiness = await invService.getTaskMaterialReadiness(
      ws.users.planner.principal,
      taskId
    );

    expect(readiness.taskId).toBe(taskId);
    expect(readiness.orderId).toBe(orderId);
    expect(readiness.demands.length).toBe(1);

    const d = readiness.demands[0];
    expect(d.demandId).toBe(demandId);
    expect(d.requiredAtoms).toBe(60000000n);
    expect(d.consumedAtoms).toBe(50000000n);
    expect(d.availableInWarehouseAtoms).toBe(50000000n);
  });
});
