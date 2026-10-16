import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { parseJsonBody } from '@/server/http/route-handler';
import { callGeminiStructured } from '@/server/ai/gemini-client';

const requestSchema = z.object({
  orderTypeName: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(20_000),
  companyProfile: z.record(z.unknown()).optional().refine(
    (profile) => profile === undefined || JSON.stringify(profile).length <= 5_000,
    'Company profile must be at most 5000 characters'
  ),
});

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['engineering.write', 'workflow.create', 'workflow.edit_draft']);
    const { orderTypeName, description, companyProfile } = await parseJsonBody(req, requestSchema);
    const prompt = `Propose a manufacturing workflow as an unverified draft. Do not invent available capacity, certifications, or machine bookings. Return JSON with nodes [{id,name,department,plannedHours,machineClass}], edges [{from,to}], transitionRules (string[]), warnings (string[]). Order type: ${orderTypeName}\nDescription: ${description}\nCompany profile: ${JSON.stringify(companyProfile ?? {})}`;
    const responseSchema = {
      type: 'object',
      properties: {
        nodes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, department: { type: 'string' }, plannedHours: { type: 'number' }, machineClass: { type: 'string' } }, required: ['id', 'name', 'department', 'plannedHours'] } },
        edges: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, condition: { type: 'string' } }, required: ['from', 'to'] } },
        transitionRules: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['nodes', 'edges', 'transitionRules', 'warnings'],
    };
    const cacheKey = `generate-workflow:${principal.workspaceId}:${createHash('sha256').update(`${orderTypeName}:${description}:${JSON.stringify(companyProfile ?? {})}`).digest('hex')}`;
    const result = await callGeminiStructured(prompt, cacheKey, { responseSchema });
    if (!result.aiResult) return NextResponse.json({ aiResult: null, reason: result.reason ?? 'unavailable', error: 'Workflow generation is unavailable. Retry later.' });
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
