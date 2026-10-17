import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { db } from '@/server/db/client';

const service = new RecoveryService(db);
const rejectSchema = z.object({ note: z.string().trim().min(1).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const principal = await requirePrincipal(request); const { id } = await params; const body = await parseJsonBody(request, rejectSchema); return jsonResponse(await service.rejectSubcontractPlan(principal, id, body.note, parseIdempotencyKey(request))); }
  catch (error) { return formatErrorResponse(error); }
}
