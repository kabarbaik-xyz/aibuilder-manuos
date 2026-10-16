import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { DocumentService } from '@/server/modules/documents/service';
import { DocumentRepository } from '@/server/modules/documents/repository';
import { PassportService } from '@/server/modules/quality/passport';
import { PortalService } from '@/server/modules/portal/service';
import { PortalRepository } from '@/server/modules/portal/repository';
import { OrderService } from '@/server/modules/orders/service';
import { ForbiddenError, NotFoundError } from '@/domain/errors';

describe('O08: Customer Evidence, Factual Passports, and Customer Portal', () => {
  let fixture: FactoryFixture;
  let documentService: DocumentService;
  let passportService: PassportService;
  let portalService: PortalService;
  let orderService: OrderService;

  let orderId: string;
  let docId: string;
  const unitSerial = 'SN-2026-TEST-001';

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    documentService = new DocumentService(new DocumentRepository(fixture.db), fixture.db);
    passportService = new PassportService(fixture.db);
    portalService = new PortalService(new PortalRepository(fixture.db));
    orderService = new OrderService(fixture.db);

    const { alpha } = fixture;

    // 1. Create Order for Customer Alpha
    const orderRes = await orderService.createOrderDraft(
      alpha.users.owner.principal,
      {
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderedQuantity: 20,
        requestedDate: '2026-11-30T00:00:00Z',
      },
      'key-order-evid-001'
    );
    orderId = orderRes.data.id;

    // Set promisedDate on order
    await fixture.db.order.update({
      where: { id: orderId },
      data: {
        promisedDate: new Date('2026-12-05T00:00:00Z'),
      },
    });

  });

  afterAll(async () => {
    await fixture.close();
  });

  it('uploads private document with SHA-256 and links to customer order', async () => {
    const { alpha } = fixture;

    const fileContent = Buffer.from('CERTIFICATE OF CONFORMANCE: Batch 2026-QC passed ISO9001.');
    const doc = await documentService.uploadDocument(alpha.users.owner.principal, {
      fileName: 'Certificate-of-Conformance.pdf',
      mimeType: 'application/pdf',
      content: fileContent,
      description: 'Customer mill inspection certificate',
      link: {
        parentType: 'ORDER',
        parentId: orderId,
        customerVisible: true,
      },
    });

    expect(doc).toBeDefined();
    expect(doc.id).toBeDefined();
    expect(doc.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.links?.length).toBe(1);
    expect(doc.links![0].customerVisible).toBe(true);

    docId = doc.id;
  });

  it('requires order write authority and a real workspace order before linking customer documents', async () => {
    const { alpha } = fixture;
    const qcPrincipal = alpha.users.qc.principal;
    await expect(documentService.uploadDocument(qcPrincipal, {
      fileName: 'unapproved-certificate.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('private qc file'),
      link: { parentType: 'ORDER', parentId: '00000000-0000-4000-8000-000000000000', customerVisible: true },
    })).rejects.toThrow(ForbiddenError);

    await expect(documentService.uploadDocument(alpha.users.owner.principal, {
      fileName: 'orphan-certificate.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('no order'),
      link: { parentType: 'ORDER', parentId: '00000000-0000-4000-8000-000000000000', customerVisible: true },
    })).rejects.toThrow(/order/i);
  });

  it('authorizes download for owning customer and blocks cross-customer access', async () => {
    const { alpha, beta } = fixture;

    // Customer A (owns the order) can download the document
    const downloadA = await documentService.authorizeDocumentDownload(
      alpha.users.customerUser.principal,
      docId
    );
    expect(downloadA.document.fileName).toBe('Certificate-of-Conformance.pdf');
    expect(downloadA.content.toString()).toContain('CERTIFICATE OF CONFORMANCE');

    // Customer B / Workspace B cannot download Customer A document
    await expect(
      documentService.authorizeDocumentDownload(
        beta.users.owner.principal,
        docId
      )
    ).rejects.toThrow();
  });

  it('does not expose a unit-agnostic passport digest to a customer', async () => {
    const { alpha } = fixture;

    await expect(
      passportService.getUnitPassport(alpha.users.customerUser.principal, unitSerial)
    ).rejects.toThrow(NotFoundError);
  });

  it('returns not found for unknown or unregistered serial number', async () => {
    const { alpha } = fixture;

    await expect(
      passportService.getUnitPassport(
        alpha.users.customerUser.principal,
        'SN-UNKNOWN-999'
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('lists customer orders in portal and allows delivery plan acknowledgment', async () => {
    const { alpha } = fixture;

    // Customer lists their orders
    const orders = await portalService.listCustomerOrders(
      alpha.users.customerUser.principal
    );
    expect(orders.length).toBeGreaterThanOrEqual(1);

    const targetOrder = orders.find((o) => o.id === orderId);
    expect(targetOrder).toBeDefined();
    expect(targetOrder!.customerAcknowledged).toBe(false);

    // Customer views order detail with documents and passports
    const detail = await portalService.getCustomerOrder(
      alpha.users.customerUser.principal,
      orderId
    );
    expect(detail.documents.length).toBe(1);
    expect(detail.passports).toHaveLength(0);
    expect(detail.milestones.length).toBe(5);

    // Customer with only read permission is strictly rejected from acknowledging promise
    const readOnlyCustomer = {
      ...alpha.users.customerUser.principal,
      permissions: new Set(['customer_order.read_own']),
    };
    await expect(
      portalService.acknowledgePromise(readOnlyCustomer, orderId)
    ).rejects.toThrow(ForbiddenError);

    // Customer acknowledges the promise
    const acknowledged = await portalService.acknowledgePromise(
      alpha.users.customerUser.principal,
      orderId
    );
    expect(acknowledged.customerAcknowledged).toBe(true);
    expect(acknowledged.customerAcknowledgedAt).toBeDefined();
  });
});
