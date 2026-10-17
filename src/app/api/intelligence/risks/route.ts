import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { risksService } from '@/server/modules/intelligence/risks';

const QuerySchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  type: z.enum(['MATERIAL_SHORTAGE', 'PENDING_APPROVAL', 'QC_REWORK', 'AT_RISK_ETA']).optional(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(10),
});

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const filters = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    return jsonResponse({ data: await risksService.list(principal, filters) });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
