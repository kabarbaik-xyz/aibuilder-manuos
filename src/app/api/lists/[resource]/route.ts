import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { readList } from '@/server/modules/lists/service';
import { jsonResponse } from '@/server/http/route-handler';
import { formatErrorResponse } from '@/server/http/errors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const { resource } = await params;
    return jsonResponse(await readList(db, principal, resource, req.nextUrl.searchParams));
  } catch (error) { return formatErrorResponse(error); }
}
