import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
const policySchema = z.object({ expectedRevision: z.number().int().positive(), recoveryBatchAtoms: z.string().regex(/^\d+$/).refine(value => BigInt(value) >= 0n && BigInt(value) <= 9_000_000_000_000_000n) }).strict();

export async function GET(request: NextRequest) {
  try { return jsonResponse({ data: await service.getRecoveryPolicy(await requirePrincipal(request)) }); }
  catch (error) { return formatErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, policySchema);
    return jsonResponse(await service.updateRecoveryPolicy(principal, body, parseIdempotencyKey(request)));
  } catch (error) { return formatErrorResponse(error); }
}
