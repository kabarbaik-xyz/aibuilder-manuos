import { NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['network.read', 'order.read', 'planning.read', 'planning.write']);

    const body = await req.json();
    const { requirement, partnerMatches } = body;

    const cacheKey = `partner-fit:${principal.workspaceId}:${requirement?.department || 'dept'}:${requirement?.machineClass || 'mach'}`;

    const prompt = `
You are a supply chain network coordinator in ManuOS.
Given:
Workload Requirement: ${JSON.stringify(requirement || {})}
Partner Matches: ${JSON.stringify(partnerMatches || [])}

Provide an objective operational evaluation of partner capability fit, transit distance, rate benchmark, and quality risks.
Rules:
- Respect data sharing consent boundaries.
- Output MUST be valid JSON conforming to this schema:
{
  "narrative": "Executive narrative comparing available partner capacity and trade-offs",
  "riskNotes": ["risk note 1", "risk note 2"]
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        narrative: { type: 'string' },
        riskNotes: { type: 'array', items: { type: 'string' } },
      },
      required: ['narrative', 'riskNotes'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: null,
        reason: res.reason || 'unavailable',
        error: 'Partner fit narrative unavailable without verified network capacity data.',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
