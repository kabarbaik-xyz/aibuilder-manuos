import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService } from '@/server/modules/masters/service';
import { assignTechnicianSkillSchema, revokeTechnicianSkillSchema } from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody, jsonResponse } from '@/server/http/route-handler';
import { BadRequestError } from '@/domain/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const body = await parseJsonBody(req, assignTechnicianSkillSchema);
    const result = await mastersService.assignSkill(principal, id, body, idempotencyKey);
    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(req);
    const idempotencyKey = parseIdempotencyKey(req);
    const skillId = req.nextUrl.searchParams.get('skillId');
    if (!skillId) {
      throw new BadRequestError("Query parameter 'skillId' is required");
    }
    const body = await parseJsonBody(req, revokeTechnicianSkillSchema).catch(() => ({ notes: undefined }));
    const result = await mastersService.revokeSkill(principal, id, skillId, body, idempotencyKey);
    return jsonResponse(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
