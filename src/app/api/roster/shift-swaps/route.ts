import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { formatErrorResponse } from '@/server/http/errors';
import { BadRequestError } from '@/domain/errors';
import { ShiftSwapService, RequestShiftSwapSchema } from '@/server/modules/masters/shift-swap';
export async function GET(req: NextRequest) {
 try { const principal=await requirePrincipal(req); const technicianId=req.nextUrl.searchParams.get('technicianId'); if(!technicianId)throw new BadRequestError('Select a technician'); return jsonResponse({data:await new ShiftSwapService(db).list(principal,technicianId,req.nextUrl.searchParams.get('sourceId')??undefined)}); } catch(error){return formatErrorResponse(error);}
}
export async function POST(req: NextRequest) {
 try { const principal=await requirePrincipal(req); return jsonResponse(await new ShiftSwapService(db).request(principal,await parseJsonBody(req,RequestShiftSwapSchema),parseIdempotencyKey(req)),{status:201}); } catch(error){return formatErrorResponse(error);}
}
