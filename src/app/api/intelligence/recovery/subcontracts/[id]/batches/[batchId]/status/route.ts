import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
const statusSchema = z.object({ status: z.literal('IN_PROGRESS'), vendorReference: z.string().trim().max(120).optional() }).strict();
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  try { const principal = await requirePrincipal(request); const { id, batchId } = await params; const body = await parseJsonBody(request, statusSchema); return jsonResponse(await service.updateSubcontractBatchStatus(principal, id, batchId, body, parseIdempotencyKey(request))); }
  catch (error) { return formatErrorResponse(error); }
}
