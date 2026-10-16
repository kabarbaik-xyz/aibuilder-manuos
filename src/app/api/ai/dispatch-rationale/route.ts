import { NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['task.assign', 'planning.write', 'planning.read']);

    const body = await req.json();
    const { task, rankedCandidates } = body;

    const cacheKey = `dispatch-rationale:${principal.workspaceId}:${task?.id || 'task'}:${(rankedCandidates || []).map((c: any) => c.technicianId || c.id).join('-')}`;

    const prompt = `
You are a dispatch supervisor assistant in ManuOS.
Given:
Task Requirements: ${JSON.stringify(task || {})}
Ranked Technician Candidates: ${JSON.stringify(rankedCandidates || [])}

Provide a crisp rationale explaining why candidate #1 is selected or ranked highest over alternative candidates.
Address:
- Skill match score and required certifications (e.g. WABO / ASME IX / 5-Axis)
- Current queue workload vs available start window
- Whether a junior-senior pairing option is appropriate
Rules:
- NEVER invent certifications not present in candidate records.
- Output MUST be valid JSON conforming to this schema:
{
  "rationale": "Clear comparative explanation of the top ranked technician",
  "gapFlag": false
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        rationale: { type: 'string' },
        gapFlag: { type: 'boolean' },
      },
      required: ['rationale', 'gapFlag'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: null,
        reason: res.reason || 'unavailable',
        error: 'Grounded dispatch rationale unavailable without active AI evaluation.',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return formatErrorResponse(err);
  }
}
