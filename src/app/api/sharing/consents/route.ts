import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { SharingService } from '@/server/modules/sharing/service';
import { ProposeShareConsentSchema } from '@/server/modules/sharing/contracts';
import { db } from '@/server/db/client';
import { parseIdempotencyKey, jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const result = await new SharingService(db).listConsents(principal);
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await req.json().catch(() => ({}));
    const input = ProposeShareConsentSchema.parse(body);
    const result = await new SharingService(db).proposeConsent(principal, input, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
