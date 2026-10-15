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

    return jsonResponse(inspection, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
