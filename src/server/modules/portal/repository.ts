import { Prisma, PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { formatQuantity } from '@/domain/quantity';
import {
  CustomerOrderSummaryDTO,
  CustomerOrderDetailDTO,
  CustomerShipmentDTO,
  CustomerDocumentDTO,
  CustomerPassportSummaryDTO,
  CustomerMilestoneDTO,
  CustomerDrawingDTO,
  CustomerChangeRequestDTO,
} from './contracts';

export class PortalRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient = defaultDb) {}

  async listCustomerOrders(
    workspaceId: string,
    customerId: string,
    pagination?: { skip: number; take: number; search?: string }
  ): Promise<CustomerOrderSummaryDTO[]> {
    const search = pagination?.search?.trim();
    const orders = await this.prisma.order.findMany({
      skip: pagination?.skip,
      take: pagination?.take,
      where: {
        workspaceId,
        customerId,
        ...(search ? { OR: [{ orderNumber: { contains: search } }, { item: { name: { contains: search } } }, { item: { code: { contains: search } } }] } : {}),
      },
      include: {
        item: true,
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    productionOutputs: {
                      include: {
                        inspections: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return orders.map((o) => {
      // Calculate QC-passed atoms on final production outputs
      let qcPassedAtoms = 0n;
      const allOutputs = o.manufacturingOrders.flatMap((mo) =>
        mo.jobsheets.flatMap((js) => js.tasks.flatMap((t) => t.productionOutputs))
      );
      const hasFinalOutputs = allOutputs.some((out) => out.isFinal);
      for (const out of allOutputs) {
        if (!hasFinalOutputs || out.isFinal) {
          for (const insp of out.inspections) {
            if (insp.status === 'FINALIZED') {
              qcPassedAtoms += insp.passedAtoms;
            }
          }
        }
      }

      const ordered = o.orderedAtoms > 0n ? o.orderedAtoms : 1n;
      const progressPct = Math.min(
        100,
        Math.round(Number((qcPassedAtoms * 100n) / ordered))
      );

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        itemName: o.item.name,
        itemCode: o.item.code,
        orderedQuantity: formatQuantity(o.orderedAtoms),
        orderedAtoms: o.orderedAtoms.toString(),
        requestedDate: o.requestedDate.toISOString(),
        promisedDate: o.promisedDate ? o.promisedDate.toISOString() : null,
        status: o.status,
        progressPct,
        qcPassedQuantity: formatQuantity(qcPassedAtoms),
        qcPassedAtoms: qcPassedAtoms.toString(),
        customerAcknowledged: o.customerAcknowledged,
        customerAcknowledgedAt: o.customerAcknowledgedAt?.toISOString() ?? null,
        customerAcknowledgedBy: o.customerAcknowledgedBy,
      };
    });
  }

  async getCustomerOrder(
    workspaceId: string,
    customerId: string,
    orderId: string
  ): Promise<CustomerOrderDetailDTO | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        workspaceId,
        customerId,
      },
      include: {
        item: true,
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    productionOutputs: {
                      include: {
                        inspections: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            lines: {
              include: {
                item: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        passports: {
          where: { status: 'RELEASED' },
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!order) return null;

    // Calculate QC-passed atoms
    let qcPassedAtoms = 0n;
    let anyTaskStarted = false;
    let allTasksCompleted = true;
    let taskCount = 0;

    const allOutputs = order.manufacturingOrders.flatMap((mo) =>
      mo.jobsheets.flatMap((js) => js.tasks.flatMap((t) => t.productionOutputs))
    );
    const hasFinalOutputs = allOutputs.some((out) => out.isFinal);

    for (const mo of order.manufacturingOrders) {
      for (const js of mo.jobsheets) {
        for (const t of js.tasks) {
          taskCount++;
          if (['IN_PROGRESS', 'RUNNING', 'PAUSED', 'WAITING_QC', 'COMPLETED'].includes(t.status)) {
            anyTaskStarted = true;
          }
          if (t.status !== 'COMPLETED') {
            allTasksCompleted = false;
          }
        }
      }
    }

    for (const out of allOutputs) {
      if (!hasFinalOutputs || out.isFinal) {
        for (const insp of out.inspections) {
          if (insp.status === 'FINALIZED') {
            qcPassedAtoms += insp.passedAtoms;
          }
        }
      }
    }

    if (taskCount === 0) allTasksCompleted = false;

    const ordered = order.orderedAtoms > 0n ? order.orderedAtoms : 1n;
    const progressPct = Math.min(
      100,
      Math.round(Number((qcPassedAtoms * 100n) / ordered))
    );

    // Fetch customer visible documents linked to this order
    const documentLinks = await this.prisma.documentLink.findMany({
      where: {
        workspaceId,
        parentType: 'ORDER',
        parentId: order.id,
        customerVisible: true,
      },
      include: {
        document: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const documents: CustomerDocumentDTO[] = documentLinks.map((lnk) => ({
      id: lnk.document.id,
      fileName: lnk.document.fileName,
      mimeType: lnk.document.mimeType,
      sizeBytes: lnk.document.sizeBytes,
      createdAt: lnk.document.createdAt.toISOString(),
      description: lnk.document.description,
    }));

    const shipments: CustomerShipmentDTO[] = order.shipments.map((s) => ({
      id: s.id,
      shipmentNumber: s.shipmentNumber,
      status: s.status,
      carrierName: s.carrierName,
      trackingNumber: s.trackingNumber,
      dispatchedAt: s.dispatchedAt?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      destinationAddress: s.destinationAddress,
      receivedBy: s.receivedBy,
      proofOfDelivery: s.proofOfDelivery,
      lines: s.lines.map((l) => ({
        itemCode: l.item.code,
        itemName: l.item.name,
        allocatedQuantity: formatQuantity(l.allocatedAtoms),
        dispatchedQuantity: formatQuantity(l.dispatchedAtoms),
        deliveredQuantity: formatQuantity(l.deliveredAtoms),
      })),
    }));

    const passports: CustomerPassportSummaryDTO[] = order.passports.map((p) => ({
      serialNumber: p.serialNumber,
      status: p.status,
      publishedAt: p.publishedAt.toISOString(),
      digestSha256: p.digestSha256,
    }));

    // Derive truthful milestones based on settled atom quantities
    const totalDeliveredAtoms = order.shipments
      .filter((s) => s.status === 'DELIVERED')
      .flatMap((s) => s.lines)
      .reduce((sum, l) => sum + l.deliveredAtoms, 0n);

    const isFullyDelivered = totalDeliveredAtoms >= order.orderedAtoms && order.orderedAtoms > 0n;
    const isPartiallyDelivered = totalDeliveredAtoms > 0n;

    const totalDispatchedAtoms = order.shipments
      .filter((s) => s.status === 'DISPATCHED' || s.status === 'DELIVERED')
      .flatMap((s) => s.lines)
      .reduce((sum, l) => sum + l.dispatchedAtoms, 0n);

    const isFullyDispatched = totalDispatchedAtoms >= order.orderedAtoms && order.orderedAtoms > 0n;
    const isPartiallyDispatched = totalDispatchedAtoms > 0n;

    const hasQcPassed = qcPassedAtoms > 0n;

    // Intake counts as settled only once the order is confirmed (release confirms
    // authoritatively); a DRAFT/REVIEW order must not read as confirmed work.
    const intakeSettled = Boolean(order.confirmedAt) || !['DRAFT', 'REVIEW'].includes(order.status);

    const milestones: CustomerMilestoneDTO[] = [
      {
        key: 'INTAKE',
        title: 'Order Confirmed & Planned',
        status: intakeSettled ? 'COMPLETED' : 'PENDING',
        completedAt: (order.confirmedAt ?? (intakeSettled ? order.createdAt : null))?.toISOString() ?? null,
      },
      {
        key: 'PRODUCTION',
        title: 'Workstation Manufacturing',
        status: allTasksCompleted
          ? 'COMPLETED'
          : anyTaskStarted
          ? 'IN_PROGRESS'
          : 'PENDING',
      },
      {
        key: 'QC',
        title: 'Quality Inspection & Verification',
        status:
          qcPassedAtoms >= order.orderedAtoms && order.orderedAtoms > 0n
            ? 'COMPLETED'
            : hasQcPassed
            ? 'IN_PROGRESS'
            : 'PENDING',
      },
      {
        key: 'DISPATCH',
        title: 'Shipment Dispatch',
        status: isFullyDispatched
          ? 'COMPLETED'
          : isPartiallyDispatched
          ? 'IN_PROGRESS'
          : 'PENDING',
      },
      {
        key: 'DELIVERY',
        title: 'Delivery & Proof of Custody',
        status: isFullyDelivered
          ? 'COMPLETED'
          : isPartiallyDelivered
          ? 'IN_PROGRESS'
          : 'PENDING',
      },
    ];

    // Query released drawing revisions for the item
    const drawingRevisions = await this.prisma.drawingRevision.findMany({
      where: {
        workspaceId,
        itemId: order.itemId,
        status: 'RELEASED',
      },
      include: {
        document: true,
      },
      orderBy: { revisionCode: 'desc' },
    });

    // Check customer drawing approvals in audit events
    const drawingApprovals = drawingRevisions.length > 0 ? await this.prisma.auditEvent.findMany({
      where: {
        workspaceId,
        action: 'customer.drawing.approved',
        aggregateType: 'DRAWING_REVISION',
        aggregateId: { in: drawingRevisions.map((d) => d.id) },
      },
      orderBy: { occurredAt: 'desc' },
    }) : [];

    const drawings: CustomerDrawingDTO[] = drawingRevisions.map((dwg) => {
      const approval = drawingApprovals.find((a) => a.aggregateId === dwg.id);
      let approvedBy: string | null = null;
      let approvedAt: string | null = null;
      if (approval) {
        try {
          const detail = JSON.parse(approval.detailJson || '{}');
          approvedBy = detail.approvedBy || null;
          approvedAt = detail.approvedAt || approval.occurredAt.toISOString();
        } catch {
          approvedAt = approval.occurredAt.toISOString();
        }
      }
      return {
        id: dwg.id,
        drawingNumber: dwg.drawingNumber,
        revisionCode: dwg.revisionCode,
        status: dwg.status,
        documentId: dwg.documentId,
        documentFileName: dwg.document.fileName,
        customerApproved: !!approval,
        customerApprovedAt: approvedAt,
        customerApprovedBy: approvedBy,
      };
    });

    // Fetch customer change requests for this order
    const ocrs = await this.prisma.orderChangeRequest.findMany({
      where: {
        workspaceId,
        orderId: order.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const changeRequests: CustomerChangeRequestDTO[] = ocrs.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      changeType: r.changeType,
      status: r.status,
      reason: r.reason,
      requestedChanges: JSON.parse(r.requestedChangesJson || '{}'),
      submittedAt: r.submittedAt?.toISOString() || null,
      approvedAt: r.approvedAt?.toISOString() || null,
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      itemName: order.item.name,
      itemCode: order.item.code,
      orderedQuantity: formatQuantity(order.orderedAtoms),
      orderedAtoms: order.orderedAtoms.toString(),
      requestedDate: order.requestedDate.toISOString(),
      promisedDate: order.promisedDate ? order.promisedDate.toISOString() : null,
      status: order.status,
      progressPct,
      qcPassedQuantity: formatQuantity(qcPassedAtoms),
      qcPassedAtoms: qcPassedAtoms.toString(),
      customerAcknowledged: order.customerAcknowledged,
      customerAcknowledgedAt: order.customerAcknowledgedAt?.toISOString() ?? null,
      customerAcknowledgedBy: order.customerAcknowledgedBy,
      shipments,
      documents,
      passports,
      milestones,
      drawings,
      changeRequests,
    };
  }

  async acknowledgePromise(
    workspaceId: string,
    customerId: string,
    orderId: string,
    actorName: string
  ): Promise<void> {
    await this.prisma.order.updateMany({
      where: {
        id: orderId,
        workspaceId,
        customerId,
      },
      data: {
        customerAcknowledged: true,
        customerAcknowledgedAt: new Date(),
        customerAcknowledgedBy: actorName,
      },
    });
  }
}
