import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/domain/errors';
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
  inspectorName: string | null;
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
  digestSha256: string | null;
  publishedAt: string | null;
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

    const isCustomerCaller = Boolean(principal.customerId);

    // External customer portal policy: unreleased or unauthenticated passports cannot be accessed
    if (isCustomerCaller) {
      if (!passportRecord || passportRecord.status !== 'RELEASED') {
        throw new NotFoundError(`Published passport for serial '${serialNumber}' not found`);
      }
      if (passportRecord.order && passportRecord.order.customerId !== principal.customerId) {
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
    }

    // 3. Assemble genealogy
    const order = passportRecord?.order;

    // Materials consumed: strictly scoped to this order's demands and tasks
    const materials: PassportMaterialInput[] = [];
    if (order) {
      const taskIds = order.manufacturingOrders.flatMap((mo) =>
        mo.jobsheets.flatMap((js) => js.tasks.map((t) => t.id))
      );

      const movements = await this.prisma.stockMovement.findMany({
        where: {
          workspaceId: principal.workspaceId,
          itemId: { in: order.demands.map((d: any) => d.itemId) },
          movementType: { in: ['ISSUE_TO_WIP', 'PRODUCTION_CONSUME'] },
          OR: [
            { referenceType: 'ORDER', referenceId: order.id },
            { referenceType: 'TASK', referenceId: { in: taskIds } },
          ],
        },
        include: {
          item: true,
          sourceLot: true,
        },
        take: 50,
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

    // Operation steps: mask internal operator PII for customer callers
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
              operatorName: isCustomerCaller
                ? null
                : (latestSession?.technician?.name ?? task.assignedTechnician?.name ?? null),
              startedAt: task.startedAt?.toISOString() ?? null,
              completedAt: task.completedAt?.toISOString() ?? null,
              status: task.status,
            });
          }
        }
      }
    }

    // QC History: mask inspector PII for customer callers
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
                  inspectorName: isCustomerCaller ? null : (insp.inspectorUser?.name ?? null),
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
                        authorizedBy: isCustomerCaller ? 'Authorized QC' : latestRework.authorizedBy.name,
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

    // Shipment Evidence
    let shipmentEvidence: PassportShipmentEvidence | null = null;
    if (order && order.shipments.length > 0) {
      const dispatchedShipment = order.shipments.find(
        (s) => s.status === 'DISPATCHED' || s.status === 'DELIVERED'
      );
      if (dispatchedShipment) {
        shipmentEvidence = {
          shipmentNumber: dispatchedShipment.shipmentNumber,
          carrierName: dispatchedShipment.carrierName,
          trackingNumber: dispatchedShipment.trackingNumber,
          dispatchedAt: dispatchedShipment.dispatchedAt?.toISOString() ?? null,
          deliveredAt: dispatchedShipment.deliveredAt?.toISOString() ?? null,
          receivedBy: dispatchedShipment.receivedBy,
          destinationAddress: dispatchedShipment.destinationAddress,
        };
      }
    }

    // Digest: never fabricate synthetic RELEASED status or fake evidence digest
    const passportStatus = passportRecord?.status ?? 'DRAFT';
    const computedDigest = passportRecord?.digestSha256;

    if (!computedDigest && isCustomerCaller) {
      throw new NotFoundError(`Published passport digest for serial '${serialNumber}' not found`);
    }

    return {
      serialNumber,
      status: passportStatus,
      digestSha256: computedDigest ?? null,
      publishedAt: passportRecord?.publishedAt.toISOString() ?? null,
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

    const digestSource = JSON.stringify({
      schemaVersion: 1,
      workspaceId: principal.workspaceId,
      serialNumber: input.serialNumber,
      orderId: input.orderId ?? null,
      itemId: input.itemId,
      lotId: input.lotId ?? null,
    });
    const digest = crypto.createHash('sha256').update(digestSource).digest('hex');

    const passport = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.passport.findUnique({
        where: {
          workspaceId_serialNumber: {
            workspaceId: principal.workspaceId,
            serialNumber: input.serialNumber,
          },
        },
      });
      if (existing && existing.status !== 'DRAFT') {
        throw new BadRequestError(`Passport '${input.serialNumber}' has already been released or revoked`);
      }

      const data = {
        orderId: input.orderId,
        itemId: input.itemId,
        lotId: input.lotId,
        status: 'RELEASED',
        digestSha256: digest,
      };
      if (existing) {
        return tx.passport.update({
          where: { workspaceId_id: { workspaceId: principal.workspaceId, id: existing.id } },
          data,
        });
      }
      return tx.passport.create({
        data: {
          workspaceId: principal.workspaceId,
          serialNumber: input.serialNumber,
          ...data,
        },
      });
    });

    return {
      id: passport.id,
      serialNumber: passport.serialNumber,
      digestSha256: passport.digestSha256,
    };
  }
}
