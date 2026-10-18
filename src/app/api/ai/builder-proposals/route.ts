import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody } from '@/server/http/route-handler';
import { BuilderProposalService } from '@/server/modules/builder-proposals/service';
import { CreateProposalInputSchema } from '@/server/modules/builder-proposals/contracts';
import { db } from '@/server/db/client';

const service = new BuilderProposalService(db);

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const input = await parseJsonBody(request, CreateProposalInputSchema);
    const proposal = await service.createProposal(principal, input);
    return jsonResponse({ data: proposal }, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
