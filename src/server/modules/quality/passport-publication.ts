import { createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { formatQuantity } from '@/domain/quantity';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { canonicalJson, executeCommand } from '@/server/db/transaction';
import type { UnitPassportDTO } from './passport';

export const PublishPassportSchema = z.object({
  serialNumber: z.string().trim().min(1).max(200), itemId: z.string().min(1),
  orderId: z.string().min(1).optional(), lotId: z.string().min(1).optional(),
}).strict();
export const PassportSharingSchema = z.object({ action: z.enum(['SHARE', 'REVOKE']) }).strict();

function facilityIds(principal: Principal) {
  return principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
}
function digest(snapshot: unknown) { return createHash('sha256').update(canonicalJson(snapshot)).digest('hex'); }

export async function readPublishedPassport(db: PrismaClient, principal: Principal, serialNumber: string): Promise<UnitPassportDTO | undefined> {
  const record = await db.passport.findFirst({
    where: { workspaceId: principal.workspaceId, serialNumber }, include: { order: { select: { customerId: true, facilityId: true } } },
  });
  if (!record?.snapshotJson) return undefined;
  if (record.status !== 'RELEASED') throw new NotFoundError('Released passport not found');
  if (principal.customerId) {
    if (record.order?.customerId !== principal.customerId || record.sharedCustomerId !== principal.customerId) {
      throw new NotFoundError('Shared passport not found');
    }
  } else {
    requireAnyPermission(principal, ['traceability.read', 'quality.read', 'order.read', 'admin.access']);
    if (!record.order?.facilityId || !facilityIds(principal).includes(record.order.facilityId)) throw new NotFoundError('Passport not found in your facility scope');
  }
  const snapshot = JSON.parse(record.snapshotJson);
  if (digest(snapshot) !== record.digestSha256) throw new BadRequestError('Passport integrity verification failed');
  return { ...snapshot, status: record.status, digestSha256: record.digestSha256, publishedAt: record.publishedAt.toISOString() };
}

export async function publishPassportSnapshot(db: PrismaClient, principal: Principal, rawInput: unknown, idempotencyKey: string = randomUUID()) {
  requireAnyPermission(principal, ['quality.inspect', 'delivery.dispatch', 'admin.access']);
  if (principal.customerId) throw new ForbiddenError('Customers cannot publish passports');
  const input = PublishPassportSchema.parse(rawInput);
  const result = await executeCommand({
    principal, commandType: 'passport.publish', idempotencyKey, payload: input, prismaClient: db,
    handler: async (tx) => {
      const existing = await tx.passport.findFirst({ where: { workspaceId: principal.workspaceId, serialNumber: input.serialNumber } });
      if (existing) throw new BadRequestError('A passport already exists for this serial; published identities cannot be replaced');
      const serials = await tx.serial.findMany({ where: { workspaceId: principal.workspaceId, serialNumber: input.serialNumber } });
      if (serials.length !== 1 || serials[0].itemId !== input.itemId || !serials[0].lotId || (input.lotId && input.lotId !== serials[0].lotId)) {
        throw new BadRequestError('Passport requires one unambiguous recorded unit identity and its dedicated lot');
      }
      const serial = serials[0];
      const outputs = await tx.productionOutput.findMany({
        where: { workspaceId: principal.workspaceId, serialId: serial.id, itemId: input.itemId, isFinal: true },
        include: {
          item: true, lot: true,
          task: { include: {
            jobsheet: { include: { manufacturingOrder: true } },
            instance: { include: {
              order: { include: { customer: true, lines: true } },
              workflowVersion: { include: { nodes: true } },
            } },
          } },
          inspections: { where: { status: 'FINALIZED' }, include: { results: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
      if (outputs.length !== 1) throw new BadRequestError('Passport requires exactly one final production output for the recorded serial');
      const output = outputs[0];
      const order = output.task.instance.order;
      if (input.orderId && input.orderId !== order.id) throw new BadRequestError('Requested order does not own the recorded unit');
      if (!order.facilityId || !facilityIds(principal).includes(order.facilityId)) throw new NotFoundError('Order not found in your facility scope');
      if (output.outputAtoms !== 1_000_000n || output.lotId !== serial.lotId || !output.lot) throw new BadRequestError('Unit output and serial lot identity are inconsistent');
      const serialLotOutputs = await tx.productionOutput.count({ where: { workspaceId: principal.workspaceId, lotId: serial.lotId } });
      if (serialLotOutputs !== 1) throw new BadRequestError('Unit genealogy requires a dedicated lot without mixed output');
      const accepted = output.inspections.reduce((total: bigint, inspection: { passedAtoms: bigint }) => total + inspection.passedAtoms, 0n);
      const scrapped = output.inspections.some((inspection: { scrappedAtoms: bigint }) => inspection.scrappedAtoms > 0n);
      if (accepted !== output.outputAtoms || scrapped || output.status !== 'INSPECTED') throw new BadRequestError('Unit must be fully accepted by finalized QC before passport publication');

      const tasks = await tx.task.findMany({
        where: { workspaceId: principal.workspaceId, instanceId: output.task.instanceId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const movements = await tx.stockMovement.findMany({
        where: { workspaceId: principal.workspaceId, movementType: 'PRODUCTION_CONSUME', referenceType: 'TASK', referenceId: { in: tasks.map((task: { id: string }) => task.id) } },
        include: { item: true, sourceLot: true }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      const documents = await tx.documentLink.findMany({
        where: { workspaceId: principal.workspaceId, parentType: 'ORDER', parentId: order.id, customerVisible: true },
        include: { document: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const shipment = await tx.shipment.findFirst({
        where: { workspaceId: principal.workspaceId, orderId: order.id, status: { in: ['DISPATCHED', 'DELIVERED'] }, lines: { some: { itemId: output.itemId, lotId: serial.lotId, dispatchedAtoms: output.outputAtoms } } },
        orderBy: [{ dispatchedAt: 'desc' }, { id: 'asc' }],
      });
      const line = order.lines.find((candidate: { id: string }) => candidate.id === output.task.jobsheet?.manufacturingOrder.orderLineId);
      const snapshot = {
        schemaVersion: 1, publicationVersion: 1, genealogyScope: 'UNIT_WITH_JOB_BATCH_INPUTS' as const,
        sourceOutputId: output.id, sourceJobId: output.task.jobsheet?.manufacturingOrderId ?? null,
        serialNumber: serial.serialNumber,
        order: {
          id: order.id, orderNumber: order.orderNumber, customerName: order.customer.name, customerId: order.customerId,
          itemName: output.item.name, itemCode: output.item.code, orderedQuantity: formatQuantity(line?.orderedAtoms ?? output.task.targetAtoms),
        },
        lot: { lotNumber: output.lot.lotNumber, supplierLotNumber: output.lot.supplierLotNumber, receivedAt: output.lot.receivedAt.toISOString() },
        materials: movements.map((movement: any) => ({ itemCode: movement.item.code, itemName: movement.item.name, lotNumber: movement.sourceLot?.lotNumber ?? null, consumedQuantity: formatQuantity(movement.atoms), sourceType: 'JOB_BATCH_CONSUMPTION' })),
        operations: tasks.map((task: any) => ({ nodeKey: task.nodeKey, title: output.task.instance.workflowVersion.nodes.find((node: { key: string }) => node.key === task.nodeKey)?.name ?? task.nodeKey, machineName: null, operatorName: null, startedAt: task.startedAt?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null, status: task.status })),
        qcEvents: output.inspections.map((inspection: any) => ({ inspectionId: inspection.id, inspectionType: inspection.sourceType, disposition: inspection.disposition, inspectorName: null, inspectedAt: inspection.updatedAt.toISOString(), checks: inspection.results.map((reading: any) => ({ checkCode: reading.checkCode, description: reading.checkDescription, method: reading.checkMethod, measuredValue: reading.measuredValue, isPassed: reading.isPassed, defectReason: null })) })),
        shipment: shipment ? { shipmentNumber: shipment.shipmentNumber, carrierName: shipment.carrierName, trackingNumber: shipment.trackingNumber, dispatchedAt: shipment.dispatchedAt?.toISOString() ?? null, deliveredAt: shipment.deliveredAt?.toISOString() ?? null, receivedBy: null, destinationAddress: shipment.destinationAddress } : null,
        documents: [...new Map(documents.map((link: any) => [link.documentId, { id: link.documentId, fileName: link.document.fileName, checksumSha256: link.document.checksumSha256, downloadUrl: `/api/documents/${encodeURIComponent(link.documentId)}/download` }])).values()],
      };
      const hash = digest(snapshot);
      const passport = await tx.passport.create({ data: {
        workspaceId: principal.workspaceId, serialNumber: serial.serialNumber, orderId: order.id, itemId: output.itemId,
        lotId: serial.lotId, status: 'RELEASED', digestSha256: hash, snapshotJson: canonicalJson(snapshot), publicationVersion: 1, publishedById: principal.userId,
      } });
      return { data: { id: passport.id, serialNumber: passport.serialNumber, digestSha256: hash }, aggregateType: 'PASSPORT', aggregateId: passport.id, resourceVersion: 1 };
    },
  });
  return result.data;
}

export async function updatePassportSharing(db: PrismaClient, principal: Principal, serialNumber: string, rawInput: unknown, idempotencyKey: string) {
  requireAnyPermission(principal, ['quality.inspect', 'delivery.dispatch', 'admin.access']);
  if (principal.customerId) throw new ForbiddenError('Customers cannot change passport publication');
  const input = PassportSharingSchema.parse(rawInput);
  return executeCommand({
    principal, commandType: 'passport.sharing.update', idempotencyKey, payload: { serialNumber, ...input }, prismaClient: db,
    handler: async (tx) => {
      const passport = await tx.passport.findFirst({
        where: { workspaceId: principal.workspaceId, serialNumber, order: { facilityId: { in: facilityIds(principal) } } }, include: { order: true },
      });
      if (!passport?.snapshotJson || passport.status !== 'RELEASED' || !passport.order) throw new NotFoundError('Published passport not found');
      const shared = input.action === 'SHARE';
      await tx.passport.update({ where: { id: passport.id }, data: {
        sharedCustomerId: shared ? passport.order.customerId : null,
        sharedAt: shared ? new Date() : passport.sharedAt, shareRevokedAt: shared ? null : new Date(),
      } });
      return { data: { serialNumber, shared, publicationVersion: passport.publicationVersion }, aggregateType: 'PASSPORT', aggregateId: passport.id, resourceVersion: passport.publicationVersion };
    },
  });
}
