import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FactoryMemoryService } from '@/server/modules/intelligence/memory';
import { db } from '@/server/db/client';
import { z } from 'zod';

const memoryService = new FactoryMemoryService(db);

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { searchParams } = new URL(req.url);

    const itemId = searchParams.get('itemId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const nodeKey = searchParams.get('nodeKey') || undefined;
    const workflowVersionId = searchParams.get('workflowVersionId') || undefined;
    const facilityId = searchParams.get('facilityId') || undefined;
    const completedFrom = searchParams.get('completedFrom') || undefined;
    const completedTo = searchParams.get('completedTo') || undefined;
    const page = z.coerce.number().int().min(1).max(1_000_000).parse(searchParams.get('page') ?? '1');
    const pageSize = z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).parse(searchParams.get('pageSize') ?? '10');

    const result = await memoryService.queryFactoryMemory(principal, {
      itemId,
      departmentId,
      nodeKey,
      workflowVersionId,
      facilityId,
      completedFrom,
      completedTo,
      page,
      pageSize,
    });

    return jsonResponse({ data: result }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
