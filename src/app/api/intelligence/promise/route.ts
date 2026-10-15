import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { PromiseService } from '@/server/modules/intelligence/promise';
import { db } from '@/server/db/client';

const promiseService = new PromiseService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const evaluation = await promiseService.evaluatePromise(principal, body);
    return jsonResponse({ data: evaluation }, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
