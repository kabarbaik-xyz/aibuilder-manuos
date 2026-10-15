import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { disruption, constraints, capacity } = body;

    const cacheKey = `recovery-options:${disruption?.id || 'default'}`;

    const prompt = `
You are an operational manufacturing recovery planner for ManuOS.
Given:
Disruption: ${JSON.stringify(disruption || {})}
Constraints: ${JSON.stringify(constraints || {})}
Factory Capacity: ${JSON.stringify(capacity || {})}

Formulate structured evaluation and trade-offs for recovery options:
1. Split batch delivery (recommended: 40 units ready Nov 25, 80 units Nov 28)
2. Additional shift (evaluate feasibility against missing material)
3. Emergency supplier / subcontracting

Rules:
- Invariant: 78 units have already passed QC. Conserve quantities (40 + 80 = 120 total).
- Material shortage cannot be resolved by overtime shift alone.
- Output MUST be valid JSON conforming to this schema:
{
  "options": [
    {
      "id": "split",
      "title": "Split batch delivery",
      "description": "Ship 40 ready units on Nov 25. Deliver remaining 80 on Nov 28 after final inspection.",
      "timeRecoveredDays": 3,
      "costImpactPct": 0.8,
      "feasible": true,
      "isRecommended": true,
      "reason": "Allows customer partial assembly to proceed without downtime."
    }
  ]
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              timeRecoveredDays: { type: 'number' },
              costImpactPct: { type: 'number' },
              feasible: { type: 'boolean' },
              isRecommended: { type: 'boolean' },
              reason: { type: 'string' },
            },
            required: ['id', 'title', 'description', 'timeRecoveredDays', 'costImpactPct', 'feasible', 'isRecommended'],
          },
        },
      },
      required: ['options'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: {
          options: [
            {
              id: 'split',
              title: 'Split batch delivery',
              description: 'Ship 40 ready units on Nov 25. Deliver remaining 80 on Nov 28 after final inspection.',
              timeRecoveredDays: 3,
              costImpactPct: 0.8,
              feasible: true,
              isRecommended: true,
              reason: 'Protects customer line continuity while terminal blocks arrive.',
            },
            {
              id: 'shift',
              title: 'Additional shift (Overtime)',
              description: 'Add Saturday overtime shift for assembly crew.',
              timeRecoveredDays: 0,
              costImpactPct: 3.5,
              feasible: false,
              isRecommended: false,
              reason: 'Infeasible: overtime shift cannot resolve missing physical component TB-400A.',
            },
            {
              id: 'outsource',
              title: 'Emergency air freight + contract inspection',
              description: 'Expedite alternative terminal blocks via air courier with third-party testing.',
              timeRecoveredDays: 2,
              costImpactPct: 4.2,
              feasible: true,
              isRecommended: false,
              reason: 'Significantly higher cost surcharge and requires secondary vendor qualification.',
            },
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
