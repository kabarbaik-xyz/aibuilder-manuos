import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { PassportService } from '@/server/modules/quality/passport';
import { BadRequestError } from '@/domain/errors';

const passportService = new PassportService();

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json().catch(() => ({}));

    if (!body.serialNumber || !body.itemId) {
      throw new BadRequestError('serialNumber and itemId are required to publish passport');
    }

    const result = await passportService.publishPassport(principal, {
      serialNumber: body.serialNumber,
      orderId: body.orderId,
      itemId: body.itemId,
      lotId: body.lotId,
    });

    return jsonResponse(result, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
