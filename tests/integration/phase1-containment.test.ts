import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import * as geminiClient from '@/server/ai/gemini-client';
import { POST as explainImpactHandler } from '@/app/api/ai/explain-impact/route';
import { POST as dispatchRationaleHandler } from '@/app/api/ai/dispatch-rationale/route';
import { POST as partnerFitHandler } from '@/app/api/ai/partner-fit/route';
import { POST as recoveryOptionsHandler } from '@/app/api/ai/recovery-options/route';
import { POST as promiseExplainHandler } from '@/app/api/ai/promise-explain/route';
import { POST as memoryRecommendHandler } from '@/app/api/ai/memory-recommend/route';
import { POST as extractRfqHandler } from '@/app/api/ai/extract-rfq/route';
import { POST as generateWorkflowHandler } from '@/app/api/ai/generate-workflow/route';
import { ExecutionService } from '@/server/modules/execution/service';
import { recordOutput } from '@/server/modules/execution/output';
import { PassportService } from '@/server/modules/quality/passport';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { InventoryService } from '@/server/modules/inventory/service';
import { DeliveryService } from '@/server/modules/delivery/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { parseAtomInput, parseQuantity } from '@/domain/quantity';
import { ValidationError, ForbiddenError, BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 1 Containment: AI Security, Assignment Ownership, Atom Arithmetic & Factual Truth', () => {
  let fixture: FactoryFixture;
  let executionService: ExecutionService;
  let passportService: PassportService;
  let recoveryService: RecoveryService;
  let orderService: OrderService;
  let workflowService: WorkflowService;
  let engineeringService: EngineeringService;
  let inventoryService: InventoryService;
  let deliveryService: DeliveryService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    executionService = new ExecutionService(fixture.db);
    passportService = new PassportService(fixture.db);
    recoveryService = new RecoveryService(fixture.db);
    orderService = new OrderService(fixture.db);
    workflowService = new WorkflowService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    inventoryService = new InventoryService(fixture.db);
    deliveryService = new DeliveryService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Legacy AI Routes Protection & No-Hallucination', () => {
    const aiEndpoints = [
      { name: 'explain-impact', handler: explainImpactHandler, body: { disruption: {}, affectedOrders: [], blockedTasks: [], runnableTasks: [] } },
      { name: 'dispatch-rationale', handler: dispatchRationaleHandler, body: { task: {}, rankedCandidates: [] } },
      { name: 'partner-fit', handler: partnerFitHandler, body: { requirement: {}, partnerMatches: [] } },
      { name: 'recovery-options', handler: recoveryOptionsHandler, body: { disruption: {}, constraints: {}, capacity: {} } },
      { name: 'promise-explain', handler: promiseExplainHandler, body: { request: {}, feasibilityResult: {} } },
      { name: 'memory-recommend', handler: memoryRecommendHandler, body: { query: {}, stats: {} } },
      { name: 'extract-rfq', handler: extractRfqHandler, body: { rfqText: 'Customer request for a machined bracket.' } },
      { name: 'generate-workflow', handler: generateWorkflowHandler, body: { orderTypeName: 'Bracket', description: 'Machine a bracket.' } },
    ];

    for (const ep of aiEndpoints) {
      it(`rejects unauthenticated requests to ${ep.name} with 401`, async () => {
        const req = new NextRequest(`http://localhost:3000/api/ai/${ep.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ep.body),
        });

        const res = await ep.handler(req);
        expect(res.status).toBe(401);
      });

      it(`rejects unauthorized customer access to ${ep.name} with 403`, async () => {
        const { alpha } = fixture;
        const req = new NextRequest(`http://localhost:3000/api/ai/${ep.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${alpha.users.customerUser.sessionToken}`,
            'x-workspace-id': alpha.workspaceId,
          },
          body: JSON.stringify(ep.body),
        });

        const res = await ep.handler(req);
        expect(res.status).toBe(403);
      });

      it(`returns unavailable without synthetic fallback hallucination when AI returns null on ${ep.name}`, async () => {
        const { alpha } = fixture;
        const spy = vi.spyOn(geminiClient, 'callGeminiStructured').mockResolvedValueOnce({
          aiResult: null,
          reason: 'unavailable',
        });

        try {
          const req = new NextRequest(`http://localhost:3000/api/ai/${ep.name}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${alpha.users.owner.sessionToken}`,
              'x-workspace-id': alpha.workspaceId,
            },
            body: JSON.stringify(ep.body),
          });

          const res = await ep.handler(req);
          expect(res.status).toBe(200);
          const data = await res.json();
          // Crucial invariant: never return synthetic fallback order ORD-2026-088 or fake Level 4 cert
          expect(data.aiResult).toBeNull();
          expect(data.reason).toBe('unavailable');
          expect(data.error).toBeDefined();
        } finally {
          spy.mockRestore();
        }
      });
    }
  });

  describe('2. Atom Arithmetic & Fractional Flooring Prohibited', () => {
    it('rejects fractional float values passed as atoms without silent flooring', () => {
      expect(() => parseAtomInput(12.5)).toThrow(ValidationError);
      expect(() => parseAtomInput(0.000001)).toThrow(ValidationError);
      expect(() => parseAtomInput(NaN)).toThrow(ValidationError);
      expect(() => parseAtomInput(Infinity)).toThrow(ValidationError);
    });

    it('accepts integer numbers, bigint, and decimal strings correctly', () => {
      expect(parseAtomInput(100)).toBe(100n);
      expect(parseAtomInput(1000000n)).toBe(1000000n);
      expect(parseAtomInput('1.5')).toBe(1500000n);
      expect(parseAtomInput('2500000')).toBe(2500000n);
    });
  });

  describe('3. Execution Assignment Ownership & No First-Active Fallback', () => {
    let testTaskId: string;
    let otherTechId: string;

    beforeAll(async () => {
      const { alpha } = fixture;

      // Create a second technician
      const otherTech = await fixture.db.technician.create({
        data: {
          workspaceId: alpha.workspaceId,
          code: 'TECH-OTHER-99',
          name: 'Other Technician',
          isActive: true,
        },
      });
      otherTechId = otherTech.id;

      // Create an order, workflow, revision, and release it
      const wf = await workflowService.createTemplate(
        alpha.users.owner.principal,
        {
          orderTypeId: alpha.masters.orderTypeId,
          code: 'WF-OWN-01',
          name: 'Ownership Test Flow',
        },
        'key-wf-own-tmpl'
      );
      const workflowVersionId = wf.data.initialVersionId;
      await workflowService.saveVersionDraft(
        alpha.users.owner.principal,
        workflowVersionId,
        {
          definition: {
            schemaVersion: 1,
            name: 'Ownership Routing',
            nodes: [
              {
                key: 'OP-OWN',
                name: 'Ownership Task',
                type: 'OPERATION',
                departmentId: alpha.masters.departmentId,
                plannedDurationMinutes: 30,
              },
            ],
            edges: [],
          },
        },
        'key-wf-own-save'
      );
      await workflowService.publishVersion(
        alpha.users.owner.principal,
        workflowVersionId,
        'key-wf-own-pub'
      );

      const ord = await orderService.createOrderDraft(
        alpha.users.owner.principal,
        {
          customerId: alpha.masters.customerId,
          orderTypeId: alpha.masters.orderTypeId,
          itemId: alpha.masters.fgItemId,
          orderedQuantity: 10,
          requestedDate: '2026-11-20T00:00:00Z',
        },
        'key-draft-own-test'
      );

      const rev = ord.data.engineeringRevisions[0];
      await engineeringService.saveEngineeringDraft(
        alpha.users.owner.principal,
        rev.id,
        {
          workflowVersionId,
          bomLines: [],
        },
        'key-save-eng-own'
      );
      await engineeringService.approveEngineeringRevision(alpha.users.owner.principal, rev.id, 'key-approve-eng-own');

      const rel = await releaseOrder(alpha.users.owner.principal, ord.data.id, 'rel-own-test', fixture.db);
      testTaskId = rel.data.taskIds['OP-OWN'];

      // Assign task to otherTechId
      await fixture.db.task.update({
        where: { id: testTaskId },
        data: { assignedTechnicianId: otherTechId, status: 'READY' },
      });
    });

    it('rejects operator starting, pausing, resuming, or recording output for a task assigned to someone else', async () => {
      const { alpha } = fixture;
      // alpha.users.operator is assigned to alpha.masters.technicianId, not otherTechId

      await expect(
        executionService.startTask(alpha.users.operator.principal, { taskId: testTaskId })
      ).rejects.toThrow(ForbiddenError);

      await expect(
        executionService.pauseTask(alpha.users.operator.principal, { taskId: testTaskId })
      ).rejects.toThrow();

      await expect(
        executionService.resumeTask(alpha.users.operator.principal, { taskId: testTaskId })
      ).rejects.toThrow();

      await expect(
        recordOutput(fixture.db, alpha.users.operator.principal, {
          taskId: testTaskId,
          outputAtoms: parseQuantity('1'),
          destinationLocationId: alpha.masters.quarantineLocationId,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects task start when task has no assigned technician and caller has no technician profile', async () => {
      const { alpha } = fixture;
      const unassignedTask = await fixture.db.task.create({
        data: {
          workspaceId: alpha.workspaceId,
          instanceId: (await fixture.db.task.findUnique({ where: { id: testTaskId } }))!.instanceId,
          nodeKey: 'OP-UNASSIGNED',
          status: 'READY',
          plannedDurationMinutes: 60,
        },
      });

      // Planner user has no linked technician
      await expect(
        executionService.startTask(alpha.users.planner.principal, { taskId: unassignedTask.id })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('4. Recovery Proposal Persistence & Anti-Tampering', () => {
    let orderId: string;

    beforeAll(async () => {
      const { alpha } = fixture;
      const ord = await orderService.createOrderDraft(
        alpha.users.owner.principal,
        {
          customerId: alpha.masters.customerId,
          orderTypeId: alpha.masters.orderTypeId,
          itemId: alpha.masters.fgItemId,
          orderedQuantity: 100,
          requestedDate: '2026-11-20T00:00:00Z',
        },
        'key-recovery-ord-draft'
      );
      orderId = ord.data.id;
    });

    it('rejects approving unpersisted or fabricated recovery proposals', async () => {
      const { alpha } = fixture;

      await expect(
        recoveryService.approveRecovery(alpha.users.owner.principal, {
          orderId,
          proposalId: '00000000-0000-0000-0000-000000000999',
          optionId: 'opt-split-batch',
          tranche1Qty: 50,
          tranche1Date: '2026-11-20',
          tranche2Qty: 50,
          tranche2Date: '2026-11-25',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects recovery approval with tranches that do not conserve total ordered quantity', async () => {
      const { alpha } = fixture;

      const prop = await recoveryService.proposeRecovery(alpha.users.planner.principal, {
        orderId,
        disruptionType: 'MATERIAL_DELAY',
        delayDays: 3,
      });

      await expect(
        recoveryService.approveRecovery(alpha.users.owner.principal, {
          orderId,
          proposalId: prop.id,
          optionId: 'opt-split-batch',
          tranche1Qty: 30, // 30 + 40 = 70 != 100 total
          tranche1Date: '2026-11-20',
          tranche2Qty: 40,
          tranche2Date: '2026-11-25',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects approving infeasible recovery option (e.g. ADD_SHIFT with material shortage)', async () => {
      const { alpha } = fixture;

      const prop = await recoveryService.proposeRecovery(alpha.users.planner.principal, {
        orderId,
        disruptionType: 'MATERIAL_DELAY',
        delayDays: 3,
      });

      await expect(
        recoveryService.approveRecovery(alpha.users.owner.principal, {
          orderId,
          proposalId: prop.id,
          optionId: 'opt-add-shift',
          tranche1Qty: 100,
          tranche1Date: '2026-11-20',
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('5. Unit Digital Passport External Scoping & PII Protection', () => {
    const serialNum = 'SN-PASS-PRIVACY-001';
    let orderId: string;

    beforeAll(async () => {
      const { alpha } = fixture;
      const ord = await orderService.createOrderDraft(
        alpha.users.owner.principal,
        {
          customerId: alpha.masters.customerId,
          orderTypeId: alpha.masters.orderTypeId,
          itemId: alpha.masters.fgItemId,
          orderedQuantity: 10,
          requestedDate: '2026-11-20T00:00:00Z',
        },
        'key-pass-privacy-draft'
      );
      orderId = ord.data.id;

      await passportService.publishPassport(alpha.users.qc.principal, {
        serialNumber: serialNum,
        orderId,
        itemId: alpha.masters.fgItemId,
      });
    });

    it('masks internal technician and inspector PII when accessed by customer user', async () => {
      const { alpha } = fixture;

      const passport = await passportService.getUnitPassport(
        alpha.users.customerUser.principal,
        serialNum
      );

      expect(passport.status).toBe('RELEASED');
      expect(passport.digestSha256).toMatch(/^[a-f0-9]{64}$/);

      // Verify operator and inspector names are masked / null for external customer
      for (const op of passport.operations) {
        expect(op.operatorName).toBeNull();
      }
      for (const qc of passport.qcEvents) {
        expect(qc.inspectorName).toBeNull();
      }
    });

    it('denies customer access to unreleased passport records', async () => {
      const { alpha } = fixture;

      await expect(
        passportService.getUnitPassport(
          alpha.users.customerUser.principal,
          'SN-UNRELEASED-999'
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
});
