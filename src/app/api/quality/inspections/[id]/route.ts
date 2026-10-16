import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { findInspectionById } from '@/server/modules/quality/repository';
import { db } from '@/server/db/client';
import { jsonResponse } from '@/server/http/route-handler';
import { requireAnyPermission } from '@/server/auth/permissions';
import { NotFoundError } from '@/domain/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['quality.read', 'quality.inspect', 'owner']);

    const { id } = await params;
    const inspection = await findInspectionById(db, principal.workspaceId, id);
    if (!inspection) {
      throw new NotFoundError(`Inspection '${id}' not found`);
    }

    let serialNumber: string | null = null;
    let passport: { published: boolean; shared: boolean } | null = null;
    if (inspection.productionOutput) {
      const order = inspection.productionOutput.task.instance.order;
      if (!order.facilityId || !(principal.facilityIds ?? []).includes(order.facilityId)) throw new NotFoundError(`Inspection '${id}' not found`);
      if (inspection.productionOutput.serialId) {
        const serial = await db.serial.findFirst({ where: { workspaceId: principal.workspaceId, id: inspection.productionOutput.serialId }, select: { serialNumber: true } });
        serialNumber = serial?.serialNumber ?? null;
        if (serialNumber) {
          const published = await db.passport.findFirst({ where: { workspaceId: principal.workspaceId, serialNumber, orderId: order.id }, select: { status: true, snapshotJson: true, sharedCustomerId: true } });
          passport = { published: published?.status === 'RELEASED' && Boolean(published.snapshotJson), shared: published?.sharedCustomerId === order.customerId };
        }
      }
    }

    return jsonResponse({ data: { ...inspection, serialNumber, passport } }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
