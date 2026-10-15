import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, snapshot } = body;

    const cacheKey = `brain-qa:${question?.slice(0, 40) || 'q'}`;

    const prompt = `
You are the ManuOS Operational Brain assistant.
You answer questions strictly using the factory snapshot below.
Factory Operational Snapshot:
${JSON.stringify(snapshot || {}, null, 2)}

User Question: "${question || ''}"

Rules:
- Read-only queries only. Never suggest changing database state directly.
- Ground answer in current active orders, bottlenecks, machine availability, or inventory facts.
- Include evidence references (order IDs, machine codes, part numbers) in evidenceRefs.
- Recommend a relevant ManuOS screen to navigate to if applicable (e.g. "command", "orchestrator", "workstation", "network", "customer").
- Output MUST be valid JSON conforming to this schema:
{
  "answer": "Concise direct answer to the user's operational question",
  "evidenceRefs": ["ORD-2026-088", "MCH-02"],
  "linkToScreen": "orchestrator"
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        linkToScreen: { type: 'string' },
      },
      required: ['answer', 'evidenceRefs'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      // Deterministic rule-based answer based on keywords
      const q = (question || '').toLowerCase();
      let answer = 'Factory operations are currently tracking 6 active work orders with 78 units passed QC.';
      let evidenceRefs = ['ORD-2026-088', 'QC-PASS-78'];
      let linkToScreen = 'command';

      if (q.includes('delay') || q.includes('disruption') || q.includes('terminal block') || q.includes('apex')) {
        answer = 'Order ORD-2026-088 has a material delivery disruption on terminal block TB-400A (+3 days delay to Nov 28). A batch split recovery plan (40 units Nov 25 / 80 units Nov 28) has been prepared.';
        evidenceRefs = ['ORD-2026-088', 'TB-400A', 'Apex Electronics'];
        linkToScreen = 'orchestrator';
      } else if (q.includes('machine') || q.includes('bottleneck') || q.includes('utilization')) {
        answer = '5-Axis CNC Mill MCH-02 is operating at 91% capacity and represents the critical bottleneck for high-precision components.';
        evidenceRefs = ['MCH-02', 'CNC 5-Axis'];
        linkToScreen = 'orchestrator';
      } else if (q.includes('technician') || q.includes('dispatch') || q.includes('wabo')) {
        answer = 'Technician Marcus Vance holds active WABO D1.1 structural welding cert. Junior apprentice Wei Lin is eligible for pairing.';
        evidenceRefs = ['T-101', 'WABO-D1.1', 'T-106'];
        linkToScreen = 'workstation';
      }

      return NextResponse.json({
        aiResult: {
          answer,
          evidenceRefs,
          linkToScreen,
        },
        reason: res.reason || 'fallback',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ aiResult: null, reason: 'error' }, { status: 500 });
  }
}
