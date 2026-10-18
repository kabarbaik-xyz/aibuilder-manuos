import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody } from '@/server/http/route-handler';
import { BuilderProposalService } from '@/server/modules/builder-proposals/service';
import { ApplyProposalInputSchema } from '@/server/modules/builder-proposals/contracts';
import { db } from '@/server/db/client';

const service = new BuilderProposalService(db);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await requirePrincipal(request);
    const input = await parseJsonBody(request, ApplyProposalInputSchema);
    const result = await service.applyProposal(principal, id, input);
    return jsonResponse({ data: result });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
