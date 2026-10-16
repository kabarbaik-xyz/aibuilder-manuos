import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { SharingService } from '@/server/modules/sharing/service';
import { DecideShareConsentSchema } from '@/server/modules/sharing/contracts';
import { db } from '@/server/db/client';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json().catch(() => ({}));
    const input = DecideShareConsentSchema.parse(body);
    const result = await new SharingService(db).decideConsent(principal, input, idempotencyKey);
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
