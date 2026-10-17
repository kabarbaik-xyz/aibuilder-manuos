import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { createCertSchema } from '@/server/modules/masters/contracts';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
export async function GET(req: NextRequest) {
  try { const principal = await requirePrincipal(req); requireAnyPermission(principal, ['resource.manage', 'planning.read', 'access.manage']); return jsonResponse({ data: await mastersService.listCertifications(principal) }); } catch (error) { return formatErrorResponse(error); }
}
export async function POST(req: NextRequest) {
  try { const principal = await requirePrincipal(req); return jsonResponse(await mastersService.createCertification(principal, await parseJsonBody(req, createCertSchema), parseIdempotencyKey(req)), { status: 201 }); } catch (error) { return formatErrorResponse(error); }
}
