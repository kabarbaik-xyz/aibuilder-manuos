import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { BuilderProposalService } from '@/server/modules/builder-proposals/service';
import { db } from '@/server/db/client';

const service = new BuilderProposalService(db);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(request);
    const proposal = await service.getProposal(principal, id);
    return jsonResponse({ data: proposal });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
