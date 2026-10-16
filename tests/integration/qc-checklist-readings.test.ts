import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { MastersService } from '@/server/modules/masters/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { recordOutput } from '@/server/modules/execution/output';
import {
  createInspection,
  finalizeInspection,
  authorizeRework,
  recordReinspection,
} from '@/server/modules/quality/service';
import { parseQuantity } from '@/domain/quantity';
import { BadRequestError } from '@/domain/errors';

describe('QLT-01: pinned QC plan enforces required readings and numeric limits', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let inventoryService: InventoryService;
  let mastersService: MastersService;

  let qcChecklistId: string;
  let productionOutputId: string;
  let taskId: string;
  let defectInspectionId: string;
  let inspectionCounter = 0;

  const nextInspection = async (atoms = parseQuantity('10')) => {
    const pending = await fixture.db.inspection.findFirst({
      where: {
        workspaceId: fixture.alpha.workspaceId,
        productionOutputId,
        reinspectionOfId: null,
        status: 'DRAFT',
      },
    });
    if (pending) return pending.id;

    inspectionCounter += 1;
    const res = await createInspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: atoms,
        qcChecklistId,
      },
      `key-insp-checklist-${inspectionCounter}`
    );
    return res.data.id;
  };

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    mastersService = new MastersService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

    await inventoryService.postOpeningBalance(
      owner,
      {
        itemId: alpha.masters.rawItemId,
        locationId: alpha.masters.rawLocationId,
        lotNumber: 'LOT-RAW-QC-LIMITS',
        atoms: parseQuantity('50'),
        notes: 'Raw stock for QC limits test',
      },
      'key-open-raw-qc-limits'
    );
    const rawLot = await fixture.db.lot.findFirst({
      where: { workspaceId: alpha.workspaceId, lotNumber: 'LOT-RAW-QC-LIMITS' },
    });

    const checklist = await mastersService.createQcChecklist(
      owner,
      {
        code: 'QC-TIGHT-TOL',
        name: 'Tight tolerance machining inspection',
        revision: 1,
        checks: [
          {
            code: 'DIM-01',
            description: 'Diameter within 24.9-25.1 mm',
            method: 'MEASUREMENT',
            unit: 'mm',
            limitsJson: '{"min":"24.9","max":"25.1"}',
            isRequired: true,
          },
          {
            code: 'TOL-02',
            description: 'Deviation within -0.05..0.05 mm',
            method: 'GAUGE',
            unit: 'mm',
            limitsJson: '{"min":"-0.05","max":"0.05"}',
            isRequired: true,
          },
          {
            code: 'VIS-01',
            description: 'Visual surface check',
            method: 'VISUAL',
            isRequired: true,
          },
        ],
      },
      'key-qc-checklist-limits'
    );
    qcChecklistId = checklist.data.id;

    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-QC-LIMITS',
        name: 'QC Limits Route',
      },
      'key-wf-qc-limits-tmpl'
    );
    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'QC Limits Route V1',
          nodes: [
            { key: 'OP-10', name: 'CNC Turning', type: 'OPERATION', plannedDurationMinutes: 30 },
          ],
          edges: [],
        },
      },
      'key-wf-qc-limits-draft'
    );
    await workflowService.submitReview(owner, draftV1.data.id, 'key-wf-qc-limits-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'key-wf-qc-limits-pub');

    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-30T17:00:00.000Z',
      },
      'key-order-qc-limits'
    );
    const orderId = orderRes.data.id;

    const revId = orderRes.data.engineeringRevisions[0].id;
    await engineeringService.saveEngineeringDraft(
      owner,
      revId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [
          {
            operationNodeKey: 'OP-10',
            itemId: alpha.masters.rawItemId,
            inputUomId: alpha.masters.uomPcsId,
            requirementQuantity: 1,
            outputBasis: 1,
          },
        ],
      },
      'key-eng-qc-limits-draft'
    );
    await engineeringService.approveEngineeringRevision(owner, revId, 'key-eng-qc-limits-approve');

    const releaseRes = await releaseOrder(owner, orderId, 'key-order-qc-limits-rel', fixture.db);
    taskId = releaseRes.data.taskIds['OP-10'];
    // Explicit assignment is a prerequisite for operator-scoped execution.
    await fixture.db.task.update({ where: { id: taskId }, data: { assignedTechnicianId: alpha.masters.technicianId } });

    const demand = await fixture.db.materialDemand.findFirst({
      where: { workspaceId: alpha.workspaceId, orderId },
    });
    const reserved = await inventoryService.reserveStock(
      alpha.users.planner.principal,
      {
        demandId: demand!.id,
        locationId: alpha.masters.rawLocationId,
        lotId: rawLot!.id,
        atoms: parseQuantity('10'),
      },
      'key-reserve-qc-limits'
    );
    await inventoryService.issueToProduction(
      alpha.users.warehouse.principal,
      {
        demandId: demand!.id,
        sourceLocationId: alpha.masters.rawLocationId,
        sourceLotId: rawLot!.id,
        wipLocationId: alpha.masters.wipLocationId,
        atoms: parseQuantity('10'),
        reservationId: reserved.data.id,
      },
      'key-issue-qc-limits'
    );

    await fixture.db.task.update({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: taskId } },
      data: { status: 'RUNNING' },
    });
    const outputRes = await recordOutput(
      fixture.db,
      alpha.users.operator.principal,
      {
        taskId,
        outputAtoms: parseQuantity('10'),
        destinationLocationId: alpha.masters.quarantineLocationId,
        isFinal: true,
        notes: 'Output for QC limits test',
      },
      'key-output-qc-limits'
    );
    productionOutputId = outputRes.data.output.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('rejects a measurement check without a numeric reading', async () => {
    const inspectionId = await nextInspection();
    await expect(
      finalizeInspection(
        fixture.db,
        fixture.alpha.users.qc.principal,
        {
          inspectionId,
          passedAtoms: parseQuantity('10'),
          scrappedAtoms: 0n,
          disposition: 'FULL',
          results: [
            { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', isPassed: true },
            { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '0.01', isPassed: true },
            { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
          ],
        },
        'key-finalize-no-reading'
      )
    ).rejects.toThrowError(/must record a numeric measured value/);
  });

  it('rejects a passing reading outside the pinned limits, including negative bounds', async () => {
    const aboveMax = await nextInspection();
    await expect(
      finalizeInspection(
        fixture.db,
        fixture.alpha.users.qc.principal,
        {
          inspectionId: aboveMax,
          passedAtoms: parseQuantity('10'),
          scrappedAtoms: 0n,
          disposition: 'FULL',
          results: [
            { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', measuredValue: '25.4', isPassed: true },
            { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '0.01', isPassed: true },
            { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
          ],
        },
        'key-finalize-above-max'
      )
    ).rejects.toThrowError(/above the allowed maximum/);

    const belowMin = await nextInspection();
    await expect(
      finalizeInspection(
        fixture.db,
        fixture.alpha.users.qc.principal,
        {
          inspectionId: belowMin,
          passedAtoms: parseQuantity('10'),
          scrappedAtoms: 0n,
          disposition: 'FULL',
          results: [
            { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', measuredValue: '25.02', isPassed: true },
            { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '-0.5', isPassed: true },
            { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
          ],
        },
        'key-finalize-below-min'
      )
    ).rejects.toThrowError(/below the required minimum/);
  });

  it('rejects QC dispositions routed to a location of the wrong stock kind', async () => {
    const fgDestinationInspection = await nextInspection();
    const results = [
      { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', measuredValue: '25.0', isPassed: true },
      { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '0.01', isPassed: true },
      { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
    ];

    await expect(finalizeInspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        inspectionId: fgDestinationInspection,
        passedAtoms: parseQuantity('10'),
        destinationFgLocationId: fixture.alpha.masters.rawLocationId,
        results,
      },
      'key-finalize-wrong-fg-kind'
    )).rejects.toThrow(/must be an active FG location/);

    const scrapDestinationInspection = await nextInspection();
    await expect(finalizeInspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        inspectionId: scrapDestinationInspection,
        passedAtoms: 0n,
        scrappedAtoms: parseQuantity('10'),
        destinationScrapLocationId: fixture.alpha.masters.fgLocationId,
        results,
      },
      'key-finalize-wrong-scrap-kind'
    )).rejects.toThrow(/must be an active SCRAP location/);
  });

  it('accepts out-of-range readings only as failing evidence and passes in-range readings', async () => {
    const inspectionId = await nextInspection();
    defectInspectionId = inspectionId;
    const finalizeRes = await finalizeInspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        inspectionId,
        passedAtoms: parseQuantity('6'),
        reworkAtoms: parseQuantity('4'),
        scrappedAtoms: 0n,
        disposition: 'PARTIAL',
        results: [
          { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', measuredValue: '25.02', isPassed: true },
          { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '0.2', isPassed: false, defectReason: 'Deviation out of tolerance on 4 units' },
          { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
        ],
      },
      'key-finalize-defect-evidence'
    );
    expect(finalizeRes.data.status).toBe('FINALIZED');
    expect(finalizeRes.data.passedAtoms).toBe(parseQuantity('6'));
    expect(finalizeRes.data.reworkAtoms).toBe(parseQuantity('4'));
  });

  it('requires the pinned plan readings again on reinspection of reworked units', async () => {
    const inspectionId = defectInspectionId;
    const rework = await authorizeRework(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        inspectionId,
        taskId,
        targetAtoms: parseQuantity('4'),
        instruction: 'Re-machine deviation and re-measure',
      },
      'key-rework-qc-limits'
    );

    await expect(createInspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        sourceType: 'PRODUCTION_OUTPUT',
        productionOutputId,
        inspectedAtoms: parseQuantity('4'),
        qcChecklistId,
      },
      'key-reinsp-create-overallocated'
    )).rejects.toThrow(/already allocated to QC inspections/);

    await expect(
      recordReinspection(
        fixture.db,
        fixture.alpha.users.qc.principal,
        {
          originalInspectionId: inspectionId,
          reworkAttemptId: rework.data.id,
          passedAtoms: parseQuantity('4'),
          scrappedAtoms: 0n,
          results: [],
        },
        'key-reinsp-missing-readings'
      )
    ).rejects.toThrowError(/Missing required check measurement/);

    const reinspected = await recordReinspection(
      fixture.db,
      fixture.alpha.users.qc.principal,
      {
        originalInspectionId: inspectionId,
        reworkAttemptId: rework.data.id,
        passedAtoms: parseQuantity('4'),
        scrappedAtoms: 0n,
        results: [
          { checkCode: 'DIM-01', checkDescription: 'Diameter', checkMethod: 'MEASUREMENT', measuredValue: '25.05', isPassed: true },
          { checkCode: 'TOL-02', checkDescription: 'Deviation', checkMethod: 'GAUGE', measuredValue: '0.01', isPassed: true },
          { checkCode: 'VIS-01', checkDescription: 'Surface', checkMethod: 'VISUAL', isPassed: true },
        ],
      },
      'key-reinsp-with-readings'
    );
    expect(reinspected.data.status).toBe('FINALIZED');

    // Conservation: 6 passed + 4 reinspected = 10 in FG; quarantine emptied.
    const fgBalance = await inventoryService.getBalances(
      fixture.alpha.users.warehouse.principal,
      { itemId: fixture.alpha.masters.fgItemId, locationId: fixture.alpha.masters.fgLocationId }
    );
    expect(fgBalance[0].onHandAtoms).toBe(parseQuantity('10'));
    const quarantine = await inventoryService.getBalances(
      fixture.alpha.users.warehouse.principal,
      { itemId: fixture.alpha.masters.fgItemId, locationId: fixture.alpha.masters.quarantineLocationId }
    );
    expect(quarantine.reduce((sum, b) => sum + b.onHandAtoms, 0n)).toBe(0n);

  });
});
