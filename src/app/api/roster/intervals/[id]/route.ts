import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { jsonResponse, parseJsonBody, parseIdempotencyKey } from '@/server/http/route-handler';
import { formatErrorResponse } from '@/server/http/errors';
import { cancelPersonRoster } from '@/server/modules/masters/person-profile';
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try { const principal = await requirePrincipal(req); const body = await parseJsonBody<{ expectedVersion: number }>(req, z.object({expectedVersion:z.number().int().positive()}).strict()); return jsonResponse(await cancelPersonRoster(db,principal,(await params).id,body.expectedVersion,parseIdempotencyKey(req))); } catch(error){return formatErrorResponse(error);}
}
