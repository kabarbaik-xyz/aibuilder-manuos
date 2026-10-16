import { NextRequest } from 'next/server';
import { handleMutationRoute } from '@/server/http/route-handler';
import { db } from '@/server/db/client';
import { PassportSharingSchema, updatePassportSharing } from '@/server/modules/quality/passport-publication';

export async function POST(req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  return handleMutationRoute(req, PassportSharingSchema, (input, { principal, idempotencyKey }) =>
    updatePassportSharing(db, principal, serial, input, idempotencyKey));
}
