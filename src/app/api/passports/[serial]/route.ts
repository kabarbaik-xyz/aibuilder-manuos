import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { PassportService } from '@/server/modules/quality/passport';

const passportService = new PassportService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { serial } = await params;
    const decodedSerial = decodeURIComponent(serial);

    const passport = await passportService.getUnitPassport(principal, decodedSerial);
    return jsonResponse(passport, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
