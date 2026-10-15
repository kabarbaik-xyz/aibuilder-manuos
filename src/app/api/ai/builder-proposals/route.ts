import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { BuilderProposalService } from '@/server/modules/builder-proposals/service';
import { CreateProposalInputSchema } from '@/server/modules/builder-proposals/contracts';
import { db } from '@/server/db/client';

const service = new BuilderProposalService(db);

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const body = await request.json();
    const input = CreateProposalInputSchema.parse(body);
    const proposal = await service.createProposal(principal, input);
    return jsonResponse({ data: proposal }, { status: 201 });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
