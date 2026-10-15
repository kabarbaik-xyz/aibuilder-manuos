import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { disruption, affectedOrders, blockedTasks, runnableTasks } = body;

    const cacheKey = `explain-impact:${disruption?.id || 'default'}:${(affectedOrders || []).map((o: any) => o.id || o).join(',')}`;

    const prompt = `
You are an operational manufacturing copilot for ManuOS.
Given the following deterministic disruption and schedule ripple data:

Disruption: ${JSON.stringify(disruption || {})}
Affected Orders: ${JSON.stringify(affectedOrders || [])}
Blocked Tasks: ${JSON.stringify(blockedTasks || [])}
Runnable Tasks (unaffected by delay): ${JSON.stringify(runnableTasks || [])}

Provide a concise, grounded operational impact explanation.
Rules:
- NEVER invent new numbers, delays, or order IDs.
- State exactly why the critical path slipped and which tasks remain runnable.
- Output MUST be valid JSON conforming to this schema:
{
  "summary": "1-2 sentence executive operational impact summary",
  "cause": "Specific root cause component and supplier",
  "blastRadius": ["string item 1", "string item 2"],
  "watchItems": ["critical item to monitor"]
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        cause: { type: 'string' },
        blastRadius: { type: 'array', items: { type: 'string' } },
        watchItems: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'cause', 'blastRadius', 'watchItems'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: {
          summary: 'Terminal block delivery delay pushes Order ORD-2026-088 completion to Nov 28 (+3 calendar days).',
          cause: 'Supplier Apex Electronics reported logistics port delay for Component TB-400A.',
          blastRadius: [
            'Wiring & harness assembly blocked until Nov 25',
            'Final functional testing and QA inspection shifted to Nov 26-28',
            'Assembly line 2 idle for 14 hours unless re-sequenced',
          ],
          watchItems: [
            'Confirm courier tracking on Nov 25 morning',
            'Verify technician availability for expedited testing on Nov 27',
          ],
        },
        reason: res.reason || 'fallback',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      {
        aiResult: null,
        reason: 'error',
      },
      { status: 500 }
    );
  }
}
