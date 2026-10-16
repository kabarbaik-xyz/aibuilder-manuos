import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { hasPermission, requireAnyPermission } from '@/server/auth/permissions';
import { ForbiddenError, NotFoundError } from '@/domain/errors';
import { DocumentRepository } from './repository';
import { executionTaskScope } from '../execution/scope';
import {
  CreateDocumentInput,
  LinkDocumentInput,
  DocumentDTO,
  DocumentLinkDTO,
  DocumentParentType,
} from './contracts';

export class DocumentService {
  constructor(
    private readonly repo: DocumentRepository = new DocumentRepository(),
    private readonly prisma: PrismaClient = defaultDb
  ) {}

  async uploadDocument(
    principal: Principal,
    input: CreateDocumentInput
  ): Promise<DocumentDTO> {
    requireAnyPermission(principal, [
      'documents.upload',
      'document.upload',
      'order.write',
      'quality.inspect',
      'delivery.dispatch',
      'admin.access',
      'task.execute_assigned',
      'task.assign',
    ]);

    const taskOnly = hasPermission(principal, 'task.execute_assigned') && !['documents.upload', 'document.upload', 'order.write', 'quality.inspect', 'delivery.dispatch', 'admin.access', 'task.assign'].some((permission) => hasPermission(principal, permission));
    if (taskOnly && input.link?.parentType !== 'TASK') throw new ForbiddenError('Operator uploads must be attached to an assigned task');
    if (input.link?.parentType === 'TASK') {
      await this.assertTaskAccess(principal, input.link.parentId);
      if (input.link.customerVisible) throw new ForbiddenError('Task evidence is internal');
    }
    if (input.link?.parentType === 'ORDER') {
      await this.assertOrderLinkAccess(principal, input.link.parentId, input.link.customerVisible ?? false);
    }

    return this.repo.saveFile(
      principal.workspaceId,
      input.fileName,
      input.mimeType,
      input.content,
      principal.userId,
      input.description,
      input.link
    );
  }

  async linkDocument(
    principal: Principal,
    input: LinkDocumentInput
  ): Promise<DocumentLinkDTO> {
    requireAnyPermission(principal, [
      'document.upload',
      'order.write',
      'quality.inspect',
      'delivery.dispatch',
      'admin.access',
      'task.execute_assigned',
      'task.assign',
    ]);

    if (input.parentType === 'TASK') {
      await this.assertTaskAccess(principal, input.parentId);
      if (input.customerVisible) throw new ForbiddenError('Task evidence is internal');
    } else if (input.parentType === 'ORDER') {
      await this.assertOrderLinkAccess(principal, input.parentId, input.customerVisible ?? false);
    } else if (hasPermission(principal, 'task.execute_assigned') && !['document.upload', 'order.write', 'quality.inspect', 'delivery.dispatch', 'admin.access', 'task.assign'].some((permission) => hasPermission(principal, permission))) {
      throw new ForbiddenError('Operators may only link evidence to assigned tasks');
    }

    const doc = await this.repo.findById(principal.workspaceId, input.documentId);
    if (!doc) {
      throw new NotFoundError(`Document not found: ${input.documentId}`);
    }
    await this.assertDocumentAccess(principal, doc);

    return this.repo.linkDocument(principal.workspaceId, input);
  }

  async getDocument(
    principal: Principal,
    documentId: string
  ): Promise<DocumentDTO> {
    const doc = await this.repo.findById(principal.workspaceId, documentId);
    if (!doc) {
      throw new NotFoundError(`Document not found: ${documentId}`);
    }

    // Authorize read
    await this.assertDocumentAccess(principal, doc);

    return doc;
  }

  async authorizeDocumentDownload(
    principal: Principal,
    documentId: string
  ): Promise<{ document: DocumentDTO; content: Buffer }> {
    const doc = await this.repo.findById(principal.workspaceId, documentId);
    if (!doc) {
      throw new NotFoundError(`Document not found: ${documentId}`);
    }

    // Authorize read access
    await this.assertDocumentAccess(principal, doc);

    const content = await this.repo.readFile(doc.storageKey);
    return { document: doc, content };
  }

  async listDocumentsForParent(
    principal: Principal,
    parentType: DocumentParentType,
    parentId: string
  ): Promise<DocumentDTO[]> {
    const isCustomer = Boolean(principal.customerId);

    // If customer, verify ownership of parent
    if (isCustomer) {
      await this.assertCustomerParentOwnership(principal, parentType, parentId);
    } else if (parentType === 'TASK') {
      await this.assertTaskAccess(principal, parentId);
    } else {
      requireAnyPermission(principal, [
        'document.read',
        'order.read',
        'quality.read',
        'delivery.read',
        'traceability.read',
        'admin.access',
      ]);
    }

    const links = await this.repo.findLinksByParent(
      principal.workspaceId,
      parentType,
      parentId,
      isCustomer // only customerVisible if customer
    );

    return links.map((lnk) => lnk.document);
  }

  private async assertDocumentAccess(
    principal: Principal,
    doc: DocumentDTO
  ): Promise<void> {
    if (principal.customerId) {
      // Customer user: Must have at least one customer_visible link to an entity owned by this customer
      if (!doc.links || doc.links.length === 0) {
        throw new ForbiddenError('Access denied: private internal document');
      }

      let hasAuthorizedLink = false;
      for (const link of doc.links) {
        if (!link.customerVisible) continue;

        const isOwner = await this.checkCustomerParentOwnership(
          principal,
          link.parentType as DocumentParentType,
          link.parentId
        );
        if (isOwner) {
          hasAuthorizedLink = true;
          break;
        }
      }

      if (!hasAuthorizedLink) {
        throw new ForbiddenError(
          'Access denied: customer cannot view documents for other accounts or internal-only files'
        );
      }
    } else {
      const taskLinks = doc.links?.filter((link) => link.parentType === 'TASK') ?? [];
      if (taskLinks.length) {
        const task = await this.prisma.task.findFirst({ where: { ...executionTaskScope(principal), id: { in: taskLinks.map((link) => link.parentId) } }, select: { id: true } });
        if (!task) throw new ForbiddenError('Access denied: task evidence is outside your assigned scope');
        requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.read', 'document.read', 'quality.read', 'admin.access']);
        return;
      }
      if (hasPermission(principal, 'task.execute_assigned')) {
        const pinnedTask = await this.prisma.task.findFirst({
          where: {
            ...executionTaskScope(principal),
            AND: [{ instance: { is: { engineeringRevision: { is: { drawingRevision: { is: { documentId: doc.id } } } } } } }],
          },
          select: { id: true },
        });
        if (pinnedTask) return;
      }
      // Staff user
      requireAnyPermission(principal, [
        'document.read',
        'order.read',
        'quality.read',
        'delivery.read',
        'traceability.read',
        'admin.access',
      ]);
    }
  }

  private async assertTaskAccess(principal: Principal, taskId: string): Promise<void> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.read', 'document.read', 'quality.read', 'quality.inspect', 'admin.access']);
    const task = await this.prisma.task.findFirst({ where: { ...executionTaskScope(principal), id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundError('Task not found in your authorized facility and assignment');
  }

  private async assertOrderLinkAccess(principal: Principal, orderId: string, customerVisible: boolean): Promise<void> {
    if (customerVisible) requireAnyPermission(principal, ['order.release']);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId: principal.workspaceId },
      select: { id: true },
    });
    if (!order) throw new NotFoundError('Order not found in this workspace');
  }

  private async assertCustomerParentOwnership(
    principal: Principal,
    parentType: DocumentParentType,
    parentId: string
  ): Promise<void> {
    const isOwner = await this.checkCustomerParentOwnership(
      principal,
      parentType,
      parentId
    );
    if (!isOwner) {
      throw new ForbiddenError(
        'Access denied: resource belongs to a different customer account'
      );
    }
  }

  private async checkCustomerParentOwnership(
    principal: Principal,
    parentType: DocumentParentType,
    parentId: string
  ): Promise<boolean> {
    if (!principal.customerId) return false;

    if (parentType === 'ORDER') {
      const order = await this.prisma.order.findFirst({
        where: { id: parentId, workspaceId: principal.workspaceId },
        select: { customerId: true },
      });
      return order?.customerId === principal.customerId;
    }

    if (parentType === 'SHIPMENT') {
      const shipment = await this.prisma.shipment.findFirst({
        where: { id: parentId, workspaceId: principal.workspaceId },
        select: { customerId: true },
      });
      return shipment?.customerId === principal.customerId;
    }

    if (parentType === 'PASSPORT') {
      const passport = await this.prisma.passport.findFirst({
        where: { id: parentId, workspaceId: principal.workspaceId },
        include: { order: { select: { customerId: true } } },
      });
      return passport?.status === 'RELEASED' && Boolean(passport.snapshotJson) && passport.sharedCustomerId === principal.customerId && passport.order?.customerId === principal.customerId;
    }

    // Tasks and Inspections are internal staff entities by default
    return false;
  }
}
