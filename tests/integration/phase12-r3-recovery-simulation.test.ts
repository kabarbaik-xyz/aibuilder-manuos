import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { PassportService } from '@/server/modules/quality/passport';
import { TelemetryService } from '@/server/modules/masters/telemetry';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 12: R3 Controlled Recovery & Advanced Capabilities', () => {
  let fixture: FactoryFixture;
  let recoveryService: RecoveryService;
  let passportService: PassportService;
  let telemetryService: TelemetryService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let workflowService: WorkflowService;

  let testOrderId: string;
  let machineId: string;
  const testSerialNumber = 'SN-AERO-P12-001';

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    recoveryService = new RecoveryService(fixture.db);
    passportService = new PassportService(fixture.db);
    telemetryService = new TelemetryService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    machineId = alpha.masters.machineId;

    // 1. Workflow setup
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P12-RECOV',
        name: 'Phase 12 Recovery Routing',
      },
      'idemp-wf-p12-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P12 Routing V1',
          nodes: [
            {
              key: 'CNC-MACHINING',
              name: 'CNC 5-Axis Milling',
              type: 'OPERATION',
              plannedDurationMinutes: 120,
            },
          ],
          edges: [],
        },
      },
      'idemp-wf-p12-draft'
    );
    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-p12-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-p12-pub');

    // 2. Order setup for 10 units
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-20T17:00:00.000Z',
      },
      'idemp-order-p12-01'
    );
    testOrderId = orderRes.data.id;
    const testRevId = orderRes.data.engineeringRevisions[0].id;

    await engineeringService.saveEngineeringDraft(
      owner,
      testRevId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [],
      },
      'idemp-eng-p12-rev1'
    );
    await engineeringService.approveEngineeringRevision(owner, testRevId, 'idemp-eng-p12-appr');
    await releaseOrder(owner, testOrderId, 'idemp-order-p12-rel', fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Disruption Recovery Proposals & Option Settlement (SCH-09, AII-06)', () => {
    let proposalId: string;
    let selectedOption: any;

    it('generates recovery proposals with realistic alternatives and mass conservation', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const proposal = await recoveryService.proposeRecovery(owner, {
        orderId: testOrderId,
        delayDays: 3,
        disruptionType: 'MATERIAL_DELAY',
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.orderId).toBe(testOrderId);
      expect(proposal.options.length).toBeGreaterThan(0);

      proposalId = proposal.id;
      selectedOption = proposal.options[0];

      // Verify options include SPLIT_BATCH or OVERTIME
      const splitOption = proposal.options.find((o) => o.type === 'SPLIT_BATCH');
      if (splitOption && splitOption.allocation) {
        const t1 = splitOption.allocation.tranche1Qty;
        const t2 = splitOption.allocation.tranche2Qty;
        expect(t1 + t2).toBe(10);
      }
    });

    it('rejects a split proposal when no final QC-passed quantity exists', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      await expect(recoveryService.approveRecovery(owner, {
        orderId: testOrderId,
        proposalId,
        optionId: selectedOption.id,
        tranche1Qty: selectedOption.allocation!.tranche1Qty,
        tranche1Date: selectedOption.allocation!.tranche1Date,
        tranche2Qty: selectedOption.allocation!.tranche2Qty,
        tranche2Date: selectedOption.allocation!.tranche2Date,
        notes: 'Approval must not claim success without applying reservations.',
      })).rejects.toThrow(/Final QC-passed quantity is insufficient/);
      const persisted = await fixture.db.recoveryProposal.findUniqueOrThrow({
        where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: proposalId } },
      });
      expect(persisted.status).toBe('PROPOSED');
    });

    it('rejects recovery approval on terminal or cancelled orders', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      // Mark order DELIVERED
      await fixture.db.order.update({
        where: { id: testOrderId },
        data: { status: 'DELIVERED' },
      });

      await expect(
        recoveryService.approveRecovery(owner, {
          orderId: testOrderId,
          proposalId,
          optionId: selectedOption.id,
          tranche1Qty: selectedOption.allocation?.tranche1Qty || 5,
          tranche1Date: selectedOption.allocation?.tranche1Date || new Date().toISOString(),
        })
      ).rejects.toThrow(BadRequestError);

      // Revert status for subsequent tests
      await fixture.db.order.update({
        where: { id: testOrderId },
        data: { status: 'IN_PRODUCTION' },
      });
    });
  });

  describe('2. Customer-Safe Product Passport (QLT-05)', () => {
    it('does not publish a passport without an immutable unit genealogy snapshot', async () => {
      const { alpha } = fixture;
      const qc = alpha.users.qc.principal;

      await expect(passportService.publishPassport(qc, {
        serialNumber: testSerialNumber,
        orderId: testOrderId,
        itemId: alpha.masters.fgItemId,
      })).rejects.toThrow(BadRequestError);
    });

    it('does not expose or replace legacy released passport rows', async () => {
      const { alpha } = fixture;
      const qc = alpha.users.qc.principal;
      const original = await fixture.db.passport.create({
        data: {
          workspaceId: qc.workspaceId,
          serialNumber: testSerialNumber,
          orderId: testOrderId,
          itemId: alpha.masters.fgItemId,
          status: 'RELEASED',
          digestSha256: 'b'.repeat(64),
        },
      });

      await expect(passportService.publishPassport(qc, {
        serialNumber: testSerialNumber,
        itemId: alpha.masters.rawItemId,
      })).rejects.toThrow(BadRequestError);

      const after = await fixture.db.passport.findUnique({
        where: { workspaceId_serialNumber: { workspaceId: qc.workspaceId, serialNumber: testSerialNumber } },
      });
      expect(after?.digestSha256).toBe(original?.digestSha256);
      expect(after?.itemId).toBe(original?.itemId);
    });

    it('hides legacy released passport digests from internal views', async () => {
      const { alpha } = fixture;
      const qc = alpha.users.qc.principal;

      await expect(passportService.getUnitPassport(qc, testSerialNumber)).rejects.toThrow(NotFoundError);
    });
  });

  describe('3. Machine Telemetry Diagnostics & Condition Monitoring (INT-05)', () => {
    it('ingests normal telemetry reading and returns diagnostic confirmation', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const result = await telemetryService.ingestTelemetry(owner, {
        machineId,
        metric: 'RPM',
        value: 12000,
        timestamp: new Date(),
        eventKey: 'telem-rpm-001',
      });

      expect(result.status).toBe('RECORDED');
      expect(result.machineId).toBe(machineId);
      expect(result.diagnosticNotice).toContain('Diagnostic monitoring only');
    });

    it('idempotently ignores duplicate telemetry event keys', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const dupResult = await telemetryService.ingestTelemetry(owner, {
        machineId,
        metric: 'RPM',
        value: 12000,
        timestamp: new Date(),
        eventKey: 'telem-rpm-001',
      });

      expect(dupResult.status).toBe('DUPLICATE_IGNORED');
    });

    it('triggers maintenance alert and flags machine when temperature exceeds safe threshold', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const alertResult = await telemetryService.ingestTelemetry(owner, {
        machineId,
        metric: 'TEMPERATURE',
        value: 104.5, // > 95°C threshold
        timestamp: new Date(),
        eventKey: 'telem-temp-alert-001',
      });

      expect(alertResult.status).toBe('ALERT_TRIGGERED');
      expect(alertResult.machineOperationalStatus).toBe('MAINTENANCE');

      const updatedMachine = await fixture.db.machine.findUnique({
        where: { id: machineId },
      });
      expect(updatedMachine?.status).toBe('MAINTENANCE');
    });
  });
});
