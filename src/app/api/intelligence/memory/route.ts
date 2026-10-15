import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FactoryMemoryService } from '@/server/modules/intelligence/memory';
import { db } from '@/server/db/client';

const memoryService = new FactoryMemoryService(db);

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { searchParams } = new URL(req.url);

    const itemId = searchParams.get('itemId') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const nodeKey = searchParams.get('nodeKey') || undefined;

    const result = await memoryService.queryFactoryMemory(principal, {
      itemId,
      departmentId,
      nodeKey,
    });

    return jsonResponse({ data: result }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
