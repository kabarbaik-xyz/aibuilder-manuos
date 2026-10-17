import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { JobCostingService } from '@/server/modules/costing/service';
import { CustomerChangeRequestService } from '@/server/modules/portal/customer-change-requests';
import { NotificationConnectorService } from '@/server/modules/connectors/notification-connectors';
import { OrderService } from '@/server/modules/orders/service';
import { BadRequestError, ForbiddenError } from '@/domain/errors';

describe('Phase 11: R2 Costing, Customer Requests & Connectors', () => {
  let fixture: FactoryFixture;
  let costingService: JobCostingService;
  let customerChangeService: CustomerChangeRequestService;
  let notificationConnectorService: NotificationConnectorService;
  let orderService: OrderService;

  let testOrderId: string;
  let otherCustomerOrderId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    costingService = new JobCostingService(fixture.db);
    customerChangeService = new CustomerChangeRequestService(fixture.db);
    notificationConnectorService = new NotificationConnectorService(fixture.db);
    orderService = new OrderService(fixture.db);

    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;

    // 1. Create primary order for customerAlpha
    const order1 = await orderService.createOrderDraft(
      owner,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 25,
        requestedDate: '2026-11-20T17:00:00.000Z',
      },
      'idemp-order-p11-01'
    );
    testOrderId = order1.data.id;

    // 2. Create secondary order for a different customer
    const otherCust = await fixture.db.customer.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'CUST-OTHER-99',
        name: 'Unrelated Customer Ltd',
        isActive: true,
      },
    });

    const order2 = await orderService.createOrderDraft(
      owner,
      {
        customerId: otherCust.id,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 10,
        requestedDate: '2026-11-25T17:00:00.000Z',
      },
      'idemp-order-p11-02'
    );
    otherCustomerOrderId = order2.data.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  describe('1. Standard vs Actual Job Costing Ledger (CST-01, CST-02)', () => {
    it('keeps absent cost evidence unavailable instead of reporting zero variance', async () => {
      const summary = await costingService.getOrderCostSummary(fixture.alpha.users.owner.principal, otherCustomerOrderId);
      expect(summary.hasEntries).toBe(false);
      expect(summary.currency).toBeNull();
      expect(summary.totalStandardCents).toBeNull();
      expect(summary.totalActualCents).toBeNull();
      expect(summary.totalVarianceCents).toBeNull();
      expect(summary.isFavorable).toBeNull();
      const explanation = await costingService.getOrderCostExplanation(fixture.alpha.users.owner.principal, otherCustomerOrderId);
      expect(explanation.unavailableReason).toContain('both standard and actual');
      expect(explanation.coverage).toEqual({ standard: false, actual: false });
      expect(explanation.contributors).toEqual([]);
    });

    it('replays a cost write with the same idempotency key without duplicating the entry', async () => {
      const owner = fixture.alpha.users.owner.principal;
      const input = {
        orderId: otherCustomerOrderId,
        costCategory: 'MACHINE' as const,
        costType: 'ACTUAL' as const,
        amountCents: '12500',
        currency: 'IDR',
      };
      const first = await costingService.recordCostEntry(owner, input, 'costing-replay-test');
      const replay = await costingService.recordCostEntry(owner, input, 'costing-replay-test');
      expect(first.data.id).toBe(replay.data.id);
      expect(replay.meta.replayed).toBe(true);
      const summary = await costingService.getOrderCostSummary(owner, otherCustomerOrderId);
      expect(summary.categories.find(category => category.category === 'MACHINE')?.entries).toHaveLength(1);
    });

    it('records standard budgets and actual incurred costs in integer minor units', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      // Budget: Standard Material 5,000,000 IDR (cents basis)
      await costingService.recordCostEntry(owner, {
        orderId: testOrderId,
        costCategory: 'MATERIAL',
        costType: 'STANDARD',
        amountCents: 5_000_000n,
        currency: 'IDR',
        notes: 'Initial BOM standard material cost',
      });

      // Budget: Standard Labor 2,000,000 IDR
      await costingService.recordCostEntry(owner, {
        orderId: testOrderId,
        costCategory: 'LABOR',
        costType: 'STANDARD',
        amountCents: 2_000_000n,
        currency: 'IDR',
      });

      // Actual incurred: Material 4,800,000 IDR (under budget)
      await costingService.recordCostEntry(owner, {
        orderId: testOrderId,
        costCategory: 'MATERIAL',
        costType: 'ACTUAL',
        amountCents: 4_800_000n,
        currency: 'IDR',
      });

      // Actual incurred: Labor 2,500,000 IDR (over budget due to rework)
      await costingService.recordCostEntry(owner, {
        orderId: testOrderId,
        costCategory: 'LABOR',
        costType: 'ACTUAL',
        amountCents: 2_500_000n,
        currency: 'IDR',
      });

      // Query cost summary & variance
      const summary = await costingService.getOrderCostSummary(owner, testOrderId);

      expect(summary.totalStandardCents).toBe('7000000');
      expect(summary.totalActualCents).toBe('7300000');
      expect(summary.totalVarianceCents).toBe('300000'); // +300,000 over budget
      expect(summary.isFavorable).toBe(false);

      const matCat = summary.categories.find((c) => c.category === 'MATERIAL');
      expect(matCat).toBeDefined();
      expect(matCat?.standardCents).toBe('5000000');
      expect(matCat?.actualCents).toBe('4800000');
      expect(matCat?.varianceCents).toBe('-200000');
      expect(matCat?.isFavorable).toBe(true);

      const laborCat = summary.categories.find((c) => c.category === 'LABOR');
      expect(laborCat).toBeDefined();
      expect(laborCat?.varianceCents).toBe('500000');
      expect(laborCat?.isFavorable).toBe(false);
      expect(matCat?.entries.map(entry => entry.notes)).toContain('Initial BOM standard material cost');
      await expect(costingService.recordCostEntry(owner, {
        orderId: testOrderId,
        costCategory: 'SCRAP',
        costType: 'ACTUAL',
        amountCents: 100n,
        currency: 'USD',
      })).rejects.toThrow(BadRequestError);
      await expect(costingService.getOrderCostSummary(alpha.users.planner.principal, testOrderId)).rejects.toThrow(ForbiddenError);
      await expect(costingService.getOrderCostExplanation(alpha.users.planner.principal, testOrderId)).rejects.toThrow(ForbiddenError);
    });

    it('ranks variance contributors by integer magnitude and includes authorized cost evidence references', async () => {
      const explanation = await costingService.getOrderCostExplanation(
        fixture.alpha.users.owner.principal,
        testOrderId,
      );

      expect(explanation.coverage).toEqual({ standard: true, actual: true });
      expect(explanation.unavailableReason).toBeNull();
      expect(explanation.contributors.map(item => item.category)).toEqual(['LABOR', 'MATERIAL']);
      expect(explanation.contributors[0]).toMatchObject({
        varianceCents: '500000',
        sourceEntryCount: 2,
        evidenceHref: `/orders/${testOrderId}`,
      });
      expect(explanation.contributors[1].varianceCents).toBe('-200000');
    });

    it('rejects negative cost ledger entries', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      await expect(
        costingService.recordCostEntry(owner, {
          orderId: testOrderId,
          costCategory: 'SCRAP',
          costType: 'ACTUAL',
          amountCents: -500n,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('2. Customer Change Request Submission & Isolation (CUS-04)', () => {
    it('permits customer to submit change request pending engineering review', async () => {
      const { alpha } = fixture;
      const customerUser = alpha.users.customerUser.principal;

      const request = await customerChangeService.submitChangeRequest(customerUser, {
        orderId: testOrderId,
        changeType: 'QUANTITY',
        reason: 'Upsizing batch size to 35 units per amended purchase contract.',
        requestedChanges: {
          requestedQuantity: 35,
        },
      });

      expect(request.id).toBeDefined();
      expect(request.status).toBe('SUBMITTED');
      expect(request.requestNumber.startsWith('OCR-')).toBe(true);
      expect(request.orderId).toBe(testOrderId);
    });

    it('forbids customer from submitting change requests for another company order', async () => {
      const { alpha } = fixture;
      const customerUser = alpha.users.customerUser.principal;

      await expect(
        customerChangeService.submitChangeRequest(customerUser, {
          orderId: otherCustomerOrderId,
          changeType: 'DATE',
          reason: 'Attempting to alter another customer schedule.',
          requestedChanges: {},
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('3. Opt-in Notification Connectors (INT-03, INT-04)', () => {
    const testRecipient = 'procurement@apex-aerospace.com';

    it('rejects outbound notification when recipient has no opt-in consent', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      await expect(
        notificationConnectorService.sendOutboundNotification(owner, {
          recipient: testRecipient,
          channel: 'EMAIL',
          templateCode: 'ORDER_DISPATCHED_NOTICE',
          payload: { orderId: testOrderId },
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('successfully delivers notification after verified opt-in consent and masks PII', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      // Explicitly register opt-in consent
      await notificationConnectorService.setConsent(owner, {
        recipient: testRecipient,
        channel: 'EMAIL',
        isOptedIn: true,
      });

      const receipt = await notificationConnectorService.sendOutboundNotification(owner, {
        recipient: testRecipient,
        channel: 'EMAIL',
        templateCode: 'ORDER_DISPATCHED_NOTICE',
        payload: { orderId: testOrderId },
      });

      expect(receipt.dispatchId).toBeDefined();
      expect(receipt.status).toBe('SENT');
      expect(receipt.channel).toBe('EMAIL');
      expect(receipt.maskedRecipient).toBe('p***t@apex-aerospace.com');
    });

    it('rejects notification immediately after consent revocation', async () => {
      const { alpha } = fixture;
      const owner = alpha.users.owner.principal;

      // Revoke opt-in consent
      await notificationConnectorService.setConsent(owner, {
        recipient: testRecipient,
        channel: 'EMAIL',
        isOptedIn: false,
      });

      await expect(
        notificationConnectorService.sendOutboundNotification(owner, {
          recipient: testRecipient,
          channel: 'EMAIL',
          templateCode: 'ORDER_DISPATCHED_NOTICE',
          payload: { orderId: testOrderId },
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
