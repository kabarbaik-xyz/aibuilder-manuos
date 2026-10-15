import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { inventoryService } from '@/server/modules/inventory/service';
import { jsonResponse } from '@/server/http/route-handler';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const searchParams = req.nextUrl.searchParams;
    const itemId = searchParams.get('itemId') || undefined;
    const locationId = searchParams.get('locationId') || undefined;
    const lotId = searchParams.get('lotId') || undefined;
    const includeZero = searchParams.get('includeZero') === 'true';

    const balances = await inventoryService.getBalances(principal, {
      itemId,
      locationId,
      lotId,
      includeZero,
    });

    return jsonResponse({ data: balances });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
