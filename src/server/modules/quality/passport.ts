import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError, ForbiddenError } from '@/domain/errors';
import { formatQuantity } from '@/domain/quantity';

export interface PassportMaterialInput {
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  consumedQuantity: string;
  sourceType: string;
}

export interface PassportOperationStep {
  nodeKey: string;
  title: string;
  machineName: string | null;
  operatorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
}

export interface PassportInspectionCheck {
  checkCode: string;
  description: string;
  method: string;
  measuredValue: string | null;
  isPassed: boolean;
  defectReason: string | null;
}

export interface PassportQcEvent {
  inspectionId: string;
  inspectionType: string;
  disposition: string;
  inspectorName: string;
  inspectedAt: string;
  checks: PassportInspectionCheck[];
  rework?: {
    attemptNumber: number;
    instruction: string;
    authorizedBy: string;
    status: string;
  };
}

export interface PassportShipmentEvidence {
  shipmentNumber: string;
  carrierName: string | null;
  trackingNumber: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  destinationAddress: string | null;
}

export interface UnitPassportDTO {
  serialNumber: string;
  status: string;
  digestSha256: string;
  publishedAt: string;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerId: string;
    itemName: string;
    itemCode: string;
    orderedQuantity: string;
  } | null;
  lot: {
    lotNumber: string;
    supplierLotNumber: string | null;
    receivedAt: string | null;
  } | null;
  materials: PassportMaterialInput[];
  operations: PassportOperationStep[];
  qcEvents: PassportQcEvent[];
  shipment: PassportShipmentEvidence | null;
}

export class PassportService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  async getUnitPassport(
    principal: Principal,
    serialNumber: string
  ): Promise<UnitPassportDTO> {
    // 1. Find passport record or serial in the current workspace
    const passportRecord = await this.prisma.passport.findFirst({
      where: {
        workspaceId: principal.workspaceId,
        serialNumber,
      },
      include: {
        order: {
          include: {
            customer: true,
            item: true,
            manufacturingOrders: {
              include: {
                jobsheets: {
                  include: {
                    tasks: {
                      include: {
                        assignedMachine: true,
                        assignedTechnician: true,
                        workSessions: {
                          include: { technician: true },
                        },
                        productionOutputs: {
                          include: {
                            inspections: {
                              include: {
                                inspectorUser: true,
                                results: true,
                                reworkAttempts: {
                                  include: { authorizedBy: true },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            demands: {
              include: {
                item: true,
              },
            },
            shipments: {
              include: {
                lines: true,
              },
            },
          },
        },
        item: true,
        lot: true,
      },
    });

    // If no passport record exists, check if serial table has it
    let orderId = passportRecord?.orderId;
    let itemId = passportRecord?.itemId;
    let lotId = passportRecord?.lotId;

    if (!passportRecord) {
      const serialRecord = await this.prisma.serial.findFirst({
        where: {
          workspaceId: principal.workspaceId,
          serialNumber,
        },
        include: {
          item: true,
          lot: true,
        },
      });

      if (!serialRecord) {
        throw new NotFoundError(`Passport for serial '${serialNumber}' not found`);
      }
      itemId = serialRecord.itemId;
      lotId = serialRecord.lotId;
    }

    // 2. Authorization
    if (principal.customerId) {
      // Customer user: Must own the originating order
      if (!passportRecord?.order || passportRecord.order.customerId !== principal.customerId) {
        throw new ForbiddenError(
          `Access denied: passport does not belong to customer account`
        );
      }
    } else {
      // Staff user
      requireAnyPermission(principal, [
        'traceability.read',
        'quality.read',
        'order.read',
        'admin.access',
      ]);
    }

    // 3. Assemble genealogy
    const order = passportRecord?.order;

    // Materials consumed
    const materials: PassportMaterialInput[] = [];
    if (order) {
      // Gather stock movements of type ISSUE_TO_WIP or PRODUCTION_CONSUME linked to this order/item
      const movements = await this.prisma.stockMovement.findMany({
        where: {
          workspaceId: principal.workspaceId,
          movementType: { in: ['ISSUE_TO_WIP', 'PRODUCTION_CONSUME'] },
        },
        include: {
          item: true,
          sourceLot: true,
        },
        take: 10,
      });

      for (const m of movements) {
        materials.push({
          itemCode: m.item.code,
          itemName: m.item.name,
          lotNumber: m.sourceLot?.lotNumber ?? null,
          consumedQuantity: formatQuantity(m.atoms),
          sourceType: m.movementType,
        });
      }
    }

    // Operation steps
    const operations: PassportOperationStep[] = [];
    if (order) {
      for (const mo of order.manufacturingOrders) {
        for (const js of mo.jobsheets) {
          for (const task of js.tasks) {
            const latestSession = task.workSessions[0];
            operations.push({
              nodeKey: task.nodeKey,
              title: `Operation ${task.nodeKey}`,
              machineName: task.assignedMachine?.name ?? null,
              operatorName: latestSession?.technician?.name ?? task.assignedTechnician?.name ?? null,
              startedAt: task.startedAt?.toISOString() ?? null,
              completedAt: task.completedAt?.toISOString() ?? null,
              status: task.status,
            });
          }
        }
      }
    }

    // QC History
    const qcEvents: PassportQcEvent[] = [];
    if (order) {
      for (const mo of order.manufacturingOrders) {
        for (const js of mo.jobsheets) {
          for (const task of js.tasks) {
            for (const out of task.productionOutputs) {
              for (const insp of out.inspections) {
                const latestRework = insp.reworkAttempts[0];
                qcEvents.push({
                  inspectionId: insp.id,
                  inspectionType: insp.sourceType,
                  disposition: insp.disposition ?? 'PENDING',
                  inspectorName: insp.inspectorUser?.name ?? 'QC Inspector',
                  inspectedAt: insp.updatedAt.toISOString(),
                  checks: insp.results.map((r) => ({
                    checkCode: r.checkCode,
                    description: r.checkDescription,
                    method: r.checkMethod,
                    measuredValue: r.measuredValue,
                    isPassed: r.isPassed,
                    defectReason: r.defectReason,
                  })),
                  rework: latestRework
                    ? {
                        attemptNumber: latestRework.attemptNumber,
                        instruction: latestRework.instruction,
                        authorizedBy: latestRework.authorizedBy.name,
                        status: latestRework.status,
                      }
                    : undefined,
                });
              }
            }
          }
        }
      }
    }

    // Shipment details
    let shipmentEvidence: PassportShipmentEvidence | null = null;
    if (order && order.shipments.length > 0) {
      const sh = order.shipments.find((s) => s.status === 'DELIVERED') || order.shipments[0];
      if (sh) {
        shipmentEvidence = {
          shipmentNumber: sh.shipmentNumber,
          carrierName: sh.carrierName,
          trackingNumber: sh.trackingNumber,
          dispatchedAt: sh.dispatchedAt?.toISOString() ?? null,
          deliveredAt: sh.deliveredAt?.toISOString() ?? null,
          receivedBy: sh.receivedBy,
          destinationAddress: sh.destinationAddress,
        };
      }
    }

    // Deterministic digest
    const digestSource = JSON.stringify({
      serialNumber,
      orderNumber: order?.orderNumber,
      itemCode: passportRecord?.item.code,
      lotNumber: passportRecord?.lot?.lotNumber,
      qcEventsCount: qcEvents.length,
      operationsCount: operations.length,
    });
    const computedDigest = passportRecord?.digestSha256 || crypto.createHash('sha256').update(digestSource).digest('hex');

    return {
      serialNumber,
      status: passportRecord?.status ?? 'RELEASED',
      digestSha256: computedDigest,
      publishedAt: passportRecord?.publishedAt.toISOString() ?? new Date().toISOString(),
      order: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customer.name,
            customerId: order.customerId,
            itemName: order.item.name,
            itemCode: order.item.code,
            orderedQuantity: formatQuantity(order.orderedAtoms),
          }
        : null,
      lot: passportRecord?.lot
        ? {
            lotNumber: passportRecord.lot.lotNumber,
            supplierLotNumber: passportRecord.lot.supplierLotNumber,
            receivedAt: passportRecord.lot.receivedAt.toISOString(),
          }
        : null,
      materials,
      operations,
      qcEvents,
      shipment: shipmentEvidence,
    };
  }

  async publishPassport(
    principal: Principal,
    input: {
      serialNumber: string;
      orderId?: string;
      itemId: string;
      lotId?: string;
    }
  ): Promise<{ id: string; serialNumber: string; digestSha256: string }> {
    requireAnyPermission(principal, ['quality.inspect', 'delivery.dispatch', 'admin.access']);

    const digest = crypto
      .createHash('sha256')
      .update(`${principal.workspaceId}:${input.serialNumber}:${Date.now()}`)
      .digest('hex');

    const passport = await this.prisma.passport.upsert({
      where: {
        workspaceId_serialNumber: {
          workspaceId: principal.workspaceId,
          serialNumber: input.serialNumber,
        },
      },
      create: {
        workspaceId: principal.workspaceId,
        serialNumber: input.serialNumber,
        orderId: input.orderId,
        itemId: input.itemId,
        lotId: input.lotId,
        status: 'RELEASED',
        digestSha256: digest,
      },
      update: {
        orderId: input.orderId,
        itemId: input.itemId,
        lotId: input.lotId,
        status: 'RELEASED',
        digestSha256: digest,
      },
    });

    return {
      id: passport.id,
      serialNumber: passport.serialNumber,
      digestSha256: passport.digestSha256,
    };
  }
}
