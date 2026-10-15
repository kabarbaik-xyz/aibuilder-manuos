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
      // Calculate QC-passed atoms
      let qcPassedAtoms = 0n;
      for (const mo of o.manufacturingOrders) {
        for (const js of mo.jobsheets) {
          for (const t of js.tasks) {
            for (const out of t.productionOutputs) {
              for (const insp of out.inspections) {
                if (insp.status === 'FINALIZED') {
                  qcPassedAtoms += insp.passedAtoms;
                }
              }
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

    for (const mo of order.manufacturingOrders) {
      for (const js of mo.jobsheets) {
        for (const t of js.tasks) {
          taskCount++;
          if (t.status === 'IN_PROGRESS' || t.status === 'COMPLETED') {
            anyTaskStarted = true;
          }
          if (t.status !== 'COMPLETED') {
            allTasksCompleted = false;
          }
          for (const out of t.productionOutputs) {
            for (const insp of out.inspections) {
              if (insp.status === 'FINALIZED') {
                qcPassedAtoms += insp.passedAtoms;
              }
            }
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

    // Derive truthful milestones
    const hasDelivered = order.shipments.some((s) => s.status === 'DELIVERED');
    const hasDispatched = order.shipments.some(
      (s) => s.status === 'DISPATCHED' || s.status === 'DELIVERED'
    );
    const hasQcPassed = qcPassedAtoms > 0n;

    const milestones: CustomerMilestoneDTO[] = [
      {
        key: 'INTAKE',
        title: 'Order Confirmed & Planned',
        status: 'COMPLETED',
        completedAt: order.createdAt.toISOString(),
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
          qcPassedAtoms >= order.orderedAtoms
            ? 'COMPLETED'
            : hasQcPassed
            ? 'IN_PROGRESS'
            : 'PENDING',
      },
      {
        key: 'DISPATCH',
        title: 'Shipment Dispatch',
        status: hasDispatched ? 'COMPLETED' : 'PENDING',
      },
      {
        key: 'DELIVERY',
        title: 'Delivery & Proof of Custody',
        status: hasDelivered ? 'COMPLETED' : 'PENDING',
      },
    ];

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
