import { NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['engineering.read', 'planning.read']);

    const body = await req.json();
    const { query, stats } = body;

    const cacheKey = `memory-recommend:${principal.workspaceId}:${query?.partFamily || 'generic'}:${query?.operationType || 'mfg'}`;

    const prompt = `
You are a senior manufacturing engineer reviewing factory memory records in ManuOS.
Given:
Query: ${JSON.stringify(query || {})}
Historical Performance Stats: ${JSON.stringify(stats || {})}

Analyze the variance and recommend an operational buffer padding percentage based on historical run overruns.
Rules:
- Ground recommendations in the provided stats.
- Keep suggestions pragmatic (typically 10-20% for high-variance CNC/welding operations).
- Output MUST be valid JSON conforming to this schema:
{
  "recommendation": "Executive recommendation for routing adjustment",
  "rationale": "Grounded explanation citing past run averages and variance",
  "suggestedPaddingPct": 15
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        recommendation: { type: 'string' },
        rationale: { type: 'string' },
        suggestedPaddingPct: { type: 'number' },
      },
      required: ['recommendation', 'rationale', 'suggestedPaddingPct'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: null,
        reason: res.reason || 'unavailable',
        error: 'Memory recommendation unavailable without historical execution evidence.',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
