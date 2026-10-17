import { NextRequest } from 'next/server';
import { BadRequestError } from '@/domain/errors';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { movementOptions } from '@/server/modules/inventory/movement-options';
export async function GET(req: NextRequest) {
 try {
  const principal = await requirePrincipal(req);
  const parsed = z.object({ mode: z.enum(['issue','return','transfer']), itemId: z.string().uuid().optional(), locationId: z.string().uuid().optional() }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw new BadRequestError('Choose a valid movement type, item and source location.');
  const query = parsed.data;
  return jsonResponse({ data: await movementOptions(db,principal,query.mode,query.itemId,query.locationId) });
 } catch(error) { return formatErrorResponse(error); }
}
