import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { recordReinspection } from '@/server/modules/quality/service';
import { db } from '@/server/db/client';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json().catch(() => ({}));

    const result = await recordReinspection(db, principal, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
