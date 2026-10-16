import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { ApiKeyService } from '@/server/modules/integrations/api-keys';
import { WebhookService } from '@/server/modules/integrations/webhooks';
import { OfflineSyncService } from '@/server/modules/execution/offline-sync';
import { ExecutionService } from '@/server/modules/execution/service';
import { FactoryKpiService } from '@/server/modules/intelligence/factory-kpis';
import { GroundedBrainService } from '@/server/modules/intelligence/grounded-brain';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Phase 9: R1 Reliable Integrations, Analytics, Grounded Assistance & Offline Work', () => {
  let fixture: FactoryFixture;
  let apiKeyService: ApiKeyService;
  let webhookService: WebhookService;
  let offlineSyncService: OfflineSyncService;
  let executionService: ExecutionService;
  let factoryKpiService: FactoryKpiService;
  let groundedBrainService: GroundedBrainService;
  let orderService: OrderService;
  let engineeringService: EngineeringService;
  let workflowService: WorkflowService;

  let testOrderId: string;
  let testTaskId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    apiKeyService = new ApiKeyService(fixture.db);
    webhookService = new WebhookService(fixture.db);
    executionService = new ExecutionService(fixture.db);
    offlineSyncService = new OfflineSyncService(fixture.db, executionService);
    factoryKpiService = new FactoryKpiService(fixture.db);
    groundedBrainService = new GroundedBrainService(fixture.db);
    orderService = new OrderService(fixture.db);
    engineeringService = new EngineeringService(fixture.db);
    workflowService = new WorkflowService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    const operator = alpha.users.operator.principal;

    // 1. Create Workflow Template and Version (no material demand needed for service operation)
    const wfTmpl = await workflowService.createTemplate(
      owner,
      {
        orderTypeId: alpha.masters.orderTypeId,
        code: 'WF-P9-ROUTING',
        name: 'Phase 9 Precision Routing',
      },
      'idemp-wf-p9-tmpl'
    );

    const draftV1 = await workflowService.saveVersionDraft(
      owner,
      wfTmpl.data.initialVersionId,
      {
        definition: {
          schemaVersion: 1,
          name: 'P9 Routing V1',
          nodes: [
            {
              key: 'CNC-01',
              name: 'CNC Roughing',
              type: 'OPERATION',
              plannedDurationMinutes: 60,
            },
          ],
          edges: [],
        },
      },
      'idemp-wf-p9-draft'
    );
    await workflowService.submitReview(owner, draftV1.data.id, 'idemp-wf-p9-rev');
    await workflowService.publishVersion(owner, draftV1.data.id, 'idemp-wf-p9-pub');

    // 2. Create Order Draft
    const orderRes = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 50,
        requestedDate: '2026-11-20T17:00:00.000Z',
      },
      'idemp-order-p9-01'
    );
    testOrderId = orderRes.data.id;
    const testRevId = orderRes.data.engineeringRevisions[0].id;

    // 3. Save & approve engineering revision (empty bomLines -> zero material shortage block)
    await engineeringService.saveEngineeringDraft(
      owner,
      testRevId,
      {
        workflowVersionId: draftV1.data.id,
        bomLines: [],
      },
      'idemp-eng-p9-rev1'
    );
    await engineeringService.approveEngineeringRevision(owner, testRevId, 'idemp-eng-p9-appr1');

    // 4. Release order to generate tasks
    await releaseOrder(owner, testOrderId, 'idemp-order-p9-rel', fixture.db);

    const task = await fixture.db.task.findFirst({
      where: {
        workspaceId: alpha.workspaceId,
      },
    });
    if (!task) {
      throw new Error('Expected task to be created after order release');
    }
    testTaskId = task.id;

    // Assign operator technician to task
    await fixture.db.task.update({
      where: { id: task.id },
      data: {
        status: 'READY',
        assignedTechnicianId: operator.technicianId,
      },
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Scoped API Key Lifecycle & Authentication', () => {
    let createdToken: string;
    let apiKeyId: string;

    it('creates a scoped API key and returns plain token once', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const result = await apiKeyService.createApiKey(owner, {
        name: 'ERP Inbound Gateway',
        scopes: ['order.read', 'execution.read'],
        expiresInDays: 30,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('ERP Inbound Gateway');
      expect(result.rawToken.startsWith('mos_')).toBe(true);
      expect(result.scopes).toEqual(['order.read', 'execution.read']);

      createdToken = result.rawToken;
      apiKeyId = result.id;
    });

    it('validates authentic token with correct required scope', async () => {
      const { alpha } = fixture;

      const validated = await apiKeyService.validateApiKey(
        alpha.workspaceId,
        createdToken,
        'order.read'
      );

      expect(validated).not.toBeNull();
      expect(validated?.id).toBe(apiKeyId);
      expect(validated?.scopes).toContain('order.read');
    });

    it('denies access if requested scope is not authorized on key', async () => {
      const { alpha } = fixture;

      const validated = await apiKeyService.validateApiKey(
        alpha.workspaceId,
        createdToken,
        'inventory.write'
      );

      expect(validated).toBeNull();
    });

    it('denies access after key revocation', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      await apiKeyService.revokeApiKey(owner, apiKeyId);

      const validated = await apiKeyService.validateApiKey(
        alpha.workspaceId,
        createdToken,
        'order.read'
      );

      expect(validated).toBeNull();
    });
  });

  describe('2. Signed Webhook Event Dispatch & Bounded Retry', () => {
    let endpointId: string;
    let secretKey: string;

    it('registers an external webhook endpoint with secret', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const ep = await webhookService.registerEndpoint(owner, {
        url: 'https://webhook.site/test-receiver',
        events: ['ORDER_STATUS_CHANGED', 'TASK_COMPLETED'],
      });

      expect(ep.id).toBeDefined();
      expect(ep.secret.startsWith('whsec_')).toBe(true);
      expect(ep.events).toContain('ORDER_STATUS_CHANGED');

      endpointId = ep.id;
      secretKey = ep.secret;
    });

    it('dispatches event and verifies HMAC signature and delivery logging', async () => {
      const { alpha } = fixture;

      const payload = {
        orderId: testOrderId,
        status: 'IN_PRODUCTION',
        timestamp: new Date().toISOString(),
      };

      const dispatches = await webhookService.dispatchEvent(
        alpha.workspaceId,
        'ORDER_STATUS_CHANGED',
        payload
      );

      expect(dispatches.length).toBeGreaterThanOrEqual(1);
      const delivery = dispatches.find((d) => d.endpointId === endpointId);
      expect(delivery).toBeDefined();
      expect(delivery?.status).toBe('DELIVERED');

      // Verify HMAC signature
      const expectedSig = WebhookService.signPayload(secretKey, JSON.stringify(payload));
      expect(delivery?.signature).toBe(expectedSig);
    });

    it('enforces maximum retry bound on failed deliveries', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      // Seed a delivery with attempts = 5
      const deadDelivery = await fixture.db.webhookDelivery.create({
        data: {
          workspaceId: alpha.workspaceId,
          endpointId,
          eventType: 'ORDER_STATUS_CHANGED',
          payloadJson: '{}',
          attempts: 5,
          status: 'FAILED',
          errorReason: 'Connection timed out',
        },
      });

      await expect(
        webhookService.retryDelivery(owner, deadDelivery.id)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('3. Durable Offline Execution Queue & Ordered Settlement', () => {
    it('enqueues offline actions with idempotency keys and rejects invalid commands', async () => {
      const { alpha } = fixture;
      const operator = alpha.users.operator.principal;

      // Invalid command type
      await expect(
        offlineSyncService.enqueueCommand(operator, {
          commandType: 'DELETE_ORDER' as any,
          idempotencyKey: 'offline-cmd-bad-01',
          payload: {},
        })
      ).rejects.toThrow(BadRequestError);

      // Valid START_TASK command
      const enqueued = await offlineSyncService.enqueueCommand(operator, {
        commandType: 'START_TASK',
        idempotencyKey: 'offline-cmd-start-001',
        payload: { taskId: testTaskId },
      });

      expect(enqueued.status).toBe('QUEUED');
      expect(enqueued.idempotencyKey).toBe('offline-cmd-start-001');

      // Duplicate enqueue returns existing queued status idempotently
      const dup = await offlineSyncService.enqueueCommand(operator, {
        commandType: 'START_TASK',
        idempotencyKey: 'offline-cmd-start-001',
        payload: { taskId: testTaskId },
      });
      expect(dup.id).toBe(enqueued.id);
    });

    it('settles queued commands and detects state conflicts without crashing', async () => {
      const { alpha } = fixture;
      const operator = alpha.users.operator.principal;

      // Process pending queue
      const settled = await offlineSyncService.processPendingQueue(operator);
      expect(settled.length).toBeGreaterThanOrEqual(1);

      // Verify task is now RUNNING
      const task = await fixture.db.task.findUnique({
        where: { id: testTaskId },
      });
      expect(task?.status).toBe('RUNNING');

      await fixture.db.task.update({ where: { id: testTaskId }, data: { status: "COMPLETED" } });
      // Now enqueue a conflicting START_TASK for an invalid/non-pending state
      await offlineSyncService.enqueueCommand(operator, {
        commandType: 'START_TASK',
        idempotencyKey: 'offline-cmd-start-conflict-002',
        payload: { taskId: testTaskId },
      });

      const secondSettlement = await offlineSyncService.processPendingQueue(operator);
      const conflictItem = secondSettlement.find(
        (s) => s.idempotencyKey === 'offline-cmd-start-conflict-002'
      );
      expect(conflictItem).toBeDefined();
      expect(conflictItem?.status).toBe('CONFLICT');
    });
  });

  describe('4. Authoritative Factory KPIs & Truthful Denominators', () => {
    it('computes factory KPIs with zero or active data', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const report = await factoryKpiService.computeKpis(owner);

      expect(report.workspaceId).toBe(alpha.workspaceId);
      expect(report.onTimeDelivery).toBeDefined();
      expect(report.firstPassYield).toBeDefined();
      expect(report.planAdherence).toBeDefined();
      expect(report.meanBlockerResolutionMinutes).toBeDefined();

      // If no closed blockers, hasData should be false
      expect(report.meanBlockerResolutionMinutes.hasData).toBe(false);
      expect(report.meanBlockerResolutionMinutes.meanMinutes).toBe(0);
    });
  });

  describe('5. Grounded Brain Evidence Queries', () => {
    it('returns authoritative evidence and caveats for active order', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const evidence = await groundedBrainService.getGroundedEvidence(owner, {
        entityType: 'ORDER',
        entityId: testOrderId,
      });

      expect(evidence.entityId).toBe(testOrderId);
      expect(evidence.codeOrNumber).toBeDefined();
      expect(evidence.authoritativeFacts.totalTasks).toBeGreaterThan(0);
      expect(evidence.referencedEvidenceIds).toContain(testOrderId);
    });

    it('returns verified item balances and available quantities', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      const evidence = await groundedBrainService.getGroundedEvidence(owner, {
        entityType: 'ITEM',
        entityId: alpha.masters.fgItemId,
      });

      expect(evidence.entityId).toBe(alpha.masters.fgItemId);
      expect(evidence.status).toBe('ACTIVE');
      expect(evidence.authoritativeFacts.totalOnHandUnits).toBeDefined();
    });

    it('rejects ungrounded queries for non-existent entities', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      await expect(
        groundedBrainService.getGroundedEvidence(owner, {
          entityType: 'ORDER',
          entityId: 'fake-order-id-999',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
