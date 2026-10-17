import { z } from 'zod';
import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse, parseJsonBody } from '@/server/http/route-handler';
import { ProductionBrainService } from '@/server/ai/brain';
import { db } from '@/server/db/client';

const brainService = new ProductionBrainService(db);
const QuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  context: z.object({ type: z.enum(['ORDER', 'ITEM', 'TASK']), id: z.string().min(1).max(100) }).optional(),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const { question, context } = await parseJsonBody(req, QuestionSchema);

    const explanation = await brainService.answerProductionQuestion(principal, question, context);

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
