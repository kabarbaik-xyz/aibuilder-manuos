import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { serializePrincipal } from '@/server/auth/principal';
import { formatErrorResponse } from '@/server/http/errors';

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    return NextResponse.json({
      data: serializePrincipal(principal),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
