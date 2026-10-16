import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { engineeringService } from '@/server/modules/engineering/service';
import { releaseDrawingRevisionSchema } from '@/server/modules/engineering/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) {
      throw new BadRequestError("Query parameter 'itemId' is required");
    }
    const drawings = await engineeringService.listDrawingRevisions(principal, itemId);
    return jsonResponse({ data: drawings });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, releaseDrawingRevisionSchema);
    const result = await engineeringService.releaseDrawingRevision(principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
