import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { formatErrorResponse } from '@/server/http/errors';
import { ShiftSwapService, DecideShiftSwapSchema } from '@/server/modules/masters/shift-swap';
export async function PATCH(req: NextRequest,{params}:{params:Promise<{id:string}>}) {
 try { const principal=await requirePrincipal(req); return jsonResponse(await new ShiftSwapService(db).decide(principal,(await params).id,await parseJsonBody(req,DecideShiftSwapSchema),parseIdempotencyKey(req))); } catch(error){return formatErrorResponse(error);}
}
