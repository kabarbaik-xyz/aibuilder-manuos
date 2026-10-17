import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
const createSchema = z.object({ taskId: z.string().uuid(), supplierId: z.string().uuid(), notes: z.string().max(1000).optional() }).strict();

export async function GET(request: NextRequest) {
  try { return jsonResponse({ data: await service.listSubcontractPlans(await requirePrincipal(request)) }); }
  catch (error) { return formatErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, createSchema);
    return jsonResponse(await service.createSubcontractPlan(principal, body, parseIdempotencyKey(request)), { status: 201 });
  } catch (error) { return formatErrorResponse(error); }
}
