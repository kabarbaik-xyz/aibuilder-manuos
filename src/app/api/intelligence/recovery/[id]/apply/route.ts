import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;
    const rawBody = await req.text();
    const selection = rawBody ? JSON.parse(rawBody) : {};
    const result = await service.applyScheduleReview(principal, id, parseIdempotencyKey(req), selection);
    return jsonResponse(result);
  } catch (error) {
    return formatErrorResponse(error);
  }
}
