import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { requirement, partnerMatches } = body;

    const cacheKey = `partner-fit:${requirement?.department || 'dept'}:${requirement?.machineClass || 'mach'}`;

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
        aiResult: {
          narrative: 'Apex Precision (Jurong Hub) provides verified 5-axis DMG MORI capacity with ISO-9001 certification. Turnaround matches required window with 1.05x benchmark rate index.',
          riskNotes: [
            'Requires bilateral data consent before sharing raw CAD parasolids',
            'Transit time adds 4 hours buffer between Jurong and Tuas facilities',
          ],
        },
        reason: res.reason || 'fallback',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ aiResult: null, reason: 'error' }, { status: 500 });
  }
}
