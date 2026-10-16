import { NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['order.create', 'order.read', 'planning.read']);

    const body = await req.json();
    const { request, feasibilityResult } = body;

    const cacheKey = `promise-explain:${principal.workspaceId}:${request?.partFamily || 'part'}:${request?.quantity || 0}`;

    const prompt = `
You are a manufacturing sales-operations promise advisor in ManuOS.
Given:
Customer Promise Request: ${JSON.stringify(request || {})}
Deterministic Capacity Feasibility Result: ${JSON.stringify(feasibilityResult || {})}

Provide an operational narrative explaining:
1. Why the requested delivery date is or is not feasible.
2. The specific bottleneck machine class and queue depth.
3. Realistic trade-offs for proposed alternative dates or rush options.

Rules:
- NEVER contradict the deterministic dates or bottleneck machines from the input.
- Output MUST be valid JSON conforming to this schema:
{
  "summary": "Executive summary of delivery feasibility",
  "bottleneckExplanation": "Specific machine queue depth and maintenance window constraints",
  "alternativesNarrative": "Comparison of standard vs split vs rush delivery options"
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        bottleneckExplanation: { type: 'string' },
        alternativesNarrative: { type: 'string' },
      },
      required: ['summary', 'bottleneckExplanation', 'alternativesNarrative'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: null,
        reason: res.reason || 'unavailable',
        error: 'Promise explanation unavailable without evaluated capacity constraints.',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
