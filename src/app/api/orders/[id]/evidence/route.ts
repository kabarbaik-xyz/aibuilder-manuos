import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { getOrderEvidenceTimeline } from '@/server/modules/order-lifecycle/traceability';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const search = req.nextUrl.searchParams.get('search') ?? undefined;
    const parsedLimit = Number(req.nextUrl.searchParams.get('limit') ?? '100');
    const result = await getOrderEvidenceTimeline(db, principal, id, {
      search,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
    });
    return jsonResponse({ data: result });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
