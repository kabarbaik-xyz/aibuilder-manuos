import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { TelemetryService } from '@/server/modules/telemetry/service';
import { db } from '@/server/db/client';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const machineId = searchParams.get('machineId');
    if (!machineId) {
      return jsonResponse({ error: 'machineId query parameter is required' }, { status: 400 });
    }
    const service = new TelemetryService(db);

    if (searchParams.get('view') === 'downtime') {
      const intervals = await service.listDowntimeIntervals(principal, machineId);
      return jsonResponse(intervals, { status: 200 });
    }
    const limit = Number(searchParams.get('limit') ?? '100');
    const events = await service.listTelemetryEvents(principal, machineId, limit);
    return jsonResponse(events, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
