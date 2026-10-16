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
  CustomerOrderLineSummaryDTO,
} from './contracts';

type ProjectedOrderLine = CustomerOrderLineSummaryDTO & {
  orderedAtoms: bigint;
  qcPassedAtoms: bigint;
  dispatchedAtoms: bigint;
  deliveredAtoms: bigint;
};

function projectOrderLines(order: any): ProjectedOrderLine[] {
  const orderLines = order.lines?.length
    ? order.lines
    : [{ id: `legacy:${order.id}`, lineNumber: 1, itemId: order.itemId, orderedAtoms: order.orderedAtoms, item: order.item, allocatedAtoms: 0n }];
  const matchingLineCounts = new Map<string, number>();
  for (const line of orderLines) matchingLineCounts.set(line.itemId, (matchingLineCounts.get(line.itemId) ?? 0) + 1);

  return orderLines.map((line: any): ProjectedOrderLine => {
    let qcPassedAtoms = 0n;
    for (const manufacturingOrder of order.manufacturingOrders ?? []) {
      const lineIsUnambiguouslyMatched =
        manufacturingOrder.orderLineId === line.id ||
        (!manufacturingOrder.orderLineId && matchingLineCounts.get(line.itemId) === 1);
      if (!lineIsUnambiguouslyMatched) continue;
      for (const jobsheet of manufacturingOrder.jobsheets ?? []) {
        for (const task of jobsheet.tasks ?? []) {
          for (const output of task.productionOutputs ?? []) {
            if (output.itemId !== line.itemId || !output.isFinal) continue;
            for (const inspection of output.inspections ?? []) {
              if (inspection.status === 'FINALIZED') qcPassedAtoms += inspection.passedAtoms;
            }
          }
        }
      }
    }

    let dispatchedAtoms = 0n;
    let deliveredAtoms = 0n;
    for (const shipment of order.shipments ?? []) {
      if (shipment.status === 'CANCELLED') continue;
      for (const shipmentLine of shipment.lines ?? []) {
        const lineIsUnambiguouslyMatched =
          (shipmentLine.orderLineId === line.id && shipmentLine.itemId === line.itemId) ||
          (!shipmentLine.orderLineId && matchingLineCounts.get(line.itemId) === 1);
        if (!lineIsUnambiguouslyMatched) continue;
        if (shipment.status === 'DISPATCHED' || shipment.status === 'DELIVERED') {
          dispatchedAtoms += shipmentLine.dispatchedAtoms;
        }
        if (shipment.status === 'DELIVERED') deliveredAtoms += shipmentLine.deliveredAtoms;
      }
    }

    const progressPct = line.orderedAtoms > 0n
      ? Math.min(100, Number((qcPassedAtoms * 100n) / line.orderedAtoms))
      : 0;
    return {
      orderLineId: line.id,
      lineNumber: line.lineNumber,
      itemName: line.item.name,
      itemCode: line.item.code,
      orderedAtoms: line.orderedAtoms,
      qcPassedAtoms,
      dispatchedAtoms,
      deliveredAtoms,
      orderedQuantity: formatQuantity(line.orderedAtoms),
      qcPassedQuantity: formatQuantity(qcPassedAtoms),
      dispatchedQuantity: formatQuantity(dispatchedAtoms),
      deliveredQuantity: formatQuantity(deliveredAtoms),
      progressPct,
    };
  });
}

function hasReachedEveryLine(orderLines: ReturnType<typeof projectOrderLines>, field: 'qcPassedAtoms' | 'dispatchedAtoms' | 'deliveredAtoms') {
  return orderLines.length > 0 && orderLines.every((line) => line[field] >= line.orderedAtoms);
}

function hasAnyLineQuantity(orderLines: ReturnType<typeof projectOrderLines>, field: 'qcPassedAtoms' | 'dispatchedAtoms' | 'deliveredAtoms') {
  return orderLines.some((line) => line[field] > 0n);
}

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
        ...(search ? { OR: [
          { orderNumber: { contains: search } },
          { item: { name: { contains: search } } },
          { item: { code: { contains: search } } },
          { lines: { some: { item: { name: { contains: search } } } } },
          { lines: { some: { item: { code: { contains: search } } } } },
        ] } : {}),
      },
      include: {
        item: true,
        lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
        shipments: { include: { lines: true } },
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
      const lines = projectOrderLines(o);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        lines: lines.map(({ orderLineId, lineNumber, itemName, itemCode, orderedQuantity, qcPassedQuantity, dispatchedQuantity, deliveredQuantity, progressPct }) => ({
          orderLineId, lineNumber, itemName, itemCode, orderedQuantity, qcPassedQuantity, dispatchedQuantity, deliveredQuantity, progressPct,
        })),
        requestedDate: o.requestedDate.toISOString(),
        promisedDate: o.promisedDate ? o.promisedDate.toISOString() : null,
        status: o.status,
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
        lines: { include: { item: true }, orderBy: { lineNumber: 'asc' } },
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
          where: { status: { in: ['DISPATCHED', 'DELIVERED'] } },
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

    const orderLines = projectOrderLines(order);
    let anyTaskStarted = false;
    let allTasksCompleted = true;
    let taskCount = 0;

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

    if (taskCount === 0) allTasksCompleted = false;

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
        orderLineId: l.orderLineId,
        itemCode: l.item.code,
        itemName: l.item.name,
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
    const isFullyDelivered = hasReachedEveryLine(orderLines, 'deliveredAtoms');
    const isPartiallyDelivered = hasAnyLineQuantity(orderLines, 'deliveredAtoms');
    const isFullyDispatched = hasReachedEveryLine(orderLines, 'dispatchedAtoms');
    const isPartiallyDispatched = hasAnyLineQuantity(orderLines, 'dispatchedAtoms');
    const isFullyQcPassed = hasReachedEveryLine(orderLines, 'qcPassedAtoms');
    const hasQcPassed = hasAnyLineQuantity(orderLines, 'qcPassedAtoms');

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
          isFullyQcPassed
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
        itemId: { in: Array.from(new Set(orderLines.map((line) => order.lines.find((candidate) => candidate.id === line.orderLineId)?.itemId ?? order.itemId))) },
        status: 'RELEASED',
      },
      include: {
        document: true,
        item: true,
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
        itemCode: dwg.item.code,
        itemName: dwg.item.name,
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
      lines: orderLines.map(({ orderLineId, lineNumber, itemName, itemCode, orderedQuantity, qcPassedQuantity, dispatchedQuantity, deliveredQuantity, progressPct }) => ({
        orderLineId, lineNumber, itemName, itemCode, orderedQuantity, qcPassedQuantity, dispatchedQuantity, deliveredQuantity, progressPct,
      })),
      requestedDate: order.requestedDate.toISOString(),
      promisedDate: order.promisedDate ? order.promisedDate.toISOString() : null,
      status: order.status,
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
