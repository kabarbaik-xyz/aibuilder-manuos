import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { findShipmentById } from '@/server/modules/delivery/repository';
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
    requireAnyPermission(principal, ['delivery.read', 'order.read', 'owner']);

    const { id } = await params;
    const shipment = await findShipmentById(db, principal.workspaceId, id);
    if (!shipment) {
      throw new NotFoundError(`Shipment '${id}' not found`);
    }

    return jsonResponse({ data: shipment }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
