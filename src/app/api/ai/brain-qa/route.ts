import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { ProductionBrainService } from '@/server/ai/brain';
import { db } from '@/server/db/client';

const brainService = new ProductionBrainService(db);

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await req.json();
    const question = String(body.question || '').trim();

    const explanation = await brainService.answerProductionQuestion(principal, question);

    // Return explanation with data for brain drawer compatibility
    const answerData = explanation.status === 'SUCCESS' ? explanation.data : explanation.fallbackData;

    return jsonResponse(
      {
        data: answerData,
        explanation,
      },
      { status: 200 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}
