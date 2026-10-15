import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { createInspection } from '@/server/modules/quality/service';
import { listInspections } from '@/server/modules/quality/repository';
import { db } from '@/server/db/client';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';
import { requireAnyPermission } from '@/server/auth/permissions';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['quality.read', 'quality.inspect', 'owner']);

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const productionOutputId = searchParams.get('productionOutputId') || undefined;
    const sourceType = searchParams.get('sourceType') || undefined;

    const inspections = await listInspections(db, principal.workspaceId, {
      status,
      productionOutputId,
      sourceType,
    });

    return jsonResponse(inspections, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json().catch(() => ({}));

    const result = await createInspection(db, principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
