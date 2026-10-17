import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { db } from '@/server/db/client';
import { jsonResponse } from '@/server/http/route-handler';
import { formatErrorResponse } from '@/server/http/errors';
import { BadRequestError } from '@/domain/errors';
import { getTechnicianProfile } from '@/server/modules/masters/person-profile';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(req);
    const start = new Date(req.nextUrl.searchParams.get('startAt') ?? new Date().toISOString());
    if (!Number.isFinite(start.getTime())) throw new BadRequestError('Choose a valid start date');
    const end = new Date(req.nextUrl.searchParams.get('endAt') ?? new Date(start.getTime() + 14 * 86400000).toISOString());
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 93 * 86400000) throw new BadRequestError('Choose a valid date range of up to 93 days');
    return jsonResponse({ data: await getTechnicianProfile(db, principal, (await params).id, start, end) });
  } catch (error) { return formatErrorResponse(error); }
}
