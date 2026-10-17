import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';
import { FormService } from '@/server/modules/forms/service';
import { db } from '@/server/db/client';

const service = new FormService(db);
const bindSchema = z.object({
  formVersionId: z.string().min(1),
  context: z.enum(['ORDER_TYPE', 'WORKFLOW_NODE', 'QC_CHECKLIST']),
  orderTypeId: z.string().optional(),
  workflowNodeKey: z.string().optional(),
  workflowVersionId: z.string().optional(),
  qcChecklistId: z.string().optional(),
  required: z.boolean().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await parseJsonBody(request, bindSchema);
    const result = await service.bindFormVersion(principal, body, parseIdempotencyKey(request));
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
