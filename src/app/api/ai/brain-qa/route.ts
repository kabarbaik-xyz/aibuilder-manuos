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
      let answer = 'Factory operations are currently tracking 6 active work orders with 78 units passed QC inspection on Shift A.';
      let evidenceRefs = ['#CO-2026-1042', 'QC-PASS-78', 'Shift A'];
      let linkToScreen = 'command';

      if (q.includes('delay') || q.includes('disruption') || q.includes('terminal block') || q.includes('tb-24') || q.includes('risk') || q.includes('attention')) {
        const delayed = snapshot?.delayed !== false;
        answer = delayed
          ? 'Order #CO-2026-1042 is projected for Nov 28 (+3 days) due to supplier delay on Terminal Blocks TB-24. Machining continues; wiring tasks T12-T14 are blocked. Recommended action: Split batch delivery.'
          : 'All 6 manufacturing orders are currently tracking on schedule with no active material disruptions.';
        evidenceRefs = ['#CO-2026-1042', 'TB-24', 'Apex Supplier'];
        linkToScreen = 'orchestrator';
      } else if (q.includes('runnable') || q.includes('keep running') || q.includes('continue')) {
        answer = 'Saw cutting, 5-Axis CNC finish milling (CNC-02), and press brake bending can proceed normally. Only wiring and electrical testing (T12, T13, T14) are waiting on terminal blocks.';
        evidenceRefs = ['CNC-02', 'PB-01', 'Tasks T1-T8'];
        linkToScreen = 'orchestrator';
      } else if (q.includes('recovery') || q.includes('plan') || q.includes('changed') || q.includes('split')) {
        const approved = snapshot?.approved;
        answer = approved
          ? 'Split delivery approved by Alex Rahman: 40 ready units reserved for Nov 25 delivery. The remaining 80 units will ship Nov 28 following TB-24 arrival.'
          : 'Proposed recovery: Split batch delivery (Tranche 1: 40 units on Nov 25; Tranche 2: 80 units on Nov 28). Cost impact is +0.8%. Ready for supervisor review.';
        evidenceRefs = ['Recovery Plan #RP-1042', '40/80 Split', 'Nov 25'];
        linkToScreen = 'orchestrator';
      } else if (q.includes('machine') || q.includes('bottleneck') || q.includes('utilization') || q.includes('cnc')) {
        answer = '5-Axis CNC Mill CNC-02 is operating at 91% capacity and represents the shop floor bottleneck. Press brake PB-01 is available on Shift A.';
        evidenceRefs = ['CNC-02 (91%)', 'PB-01 (Ready)', 'Shift A'];
        linkToScreen = 'workstation';
      } else if (q.includes('technician') || q.includes('operator') || q.includes('hendra') || q.includes('marcus') || q.includes('who')) {
        answer = 'Technician Hendra Wijaya is active on CNC-02 (Shift A). Budi Santoso is certified for precision assembly pairing.';
        evidenceRefs = ['Hendra Wijaya (CNC)', 'Budi Santoso (Assembly)'];
        linkToScreen = 'workstation';
      } else if (q.includes('network') || q.includes('partner') || q.includes('subcontract') || q.includes('batam')) {
        answer = 'Batam CNC Hub has 38 hours of reserve 5-axis capacity available. Nusantara Metalcraft offers expedited delivery for electrical components.';
        evidenceRefs = ['Batam CNC Hub', 'Nusantara Metalcraft'];
        linkToScreen = 'network';
      } else if (q.includes('material') || q.includes('stock') || q.includes('inventory') || q.includes('aluminum') || q.includes('titanium')) {
        answer = 'Raw inventory: Aluminum 6061-T6 billet has 450 kg in stock. Titanium Ti-6Al-4V has 320 kg QC-passed. Terminal blocks TB-24 are currently depleted.';
        evidenceRefs = ['AL-6061 (450kg)', 'Ti-6Al-4V (320kg)', 'TB-24 (Stockout)'];
        linkToScreen = 'orchestrator';
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
