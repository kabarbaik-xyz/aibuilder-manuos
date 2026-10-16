import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requirePrincipal } from '@/server/auth/auth';
import { requireAnyPermission } from '@/server/auth/permissions';
import { formatErrorResponse } from '@/server/http/errors';
import { parseJsonBody } from '@/server/http/route-handler';
import { callGeminiStructured } from '@/server/ai/gemini-client';

const requestSchema = z.object({ rfqText: z.string().trim().min(1).max(20_000) });

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    requireAnyPermission(principal, ['order.create', 'engineering.write']);
    const { rfqText } = await parseJsonBody(req, requestSchema);
    const prompt = `Extract customer RFQ into a draft only. Do not infer missing specifications; list them under ambiguities. Return JSON with customer, partName, qty (integer), material, tolerances (string[]), ambiguities (string[]), draftBOM (array of partNumber/name/qtyPerUnit/leadTimeDays), draftRouting (array of sequence/operation/machineClass/plannedHours), and qcChecklist (string[]). RFQ:\n${rfqText}`;
    const responseSchema = {
      type: 'object',
      properties: {
        customer: { type: 'string' }, partName: { type: 'string' }, qty: { type: 'integer' }, material: { type: 'string' },
        tolerances: { type: 'array', items: { type: 'string' } }, ambiguities: { type: 'array', items: { type: 'string' } },
        draftBOM: { type: 'array', items: { type: 'object', properties: { partNumber: { type: 'string' }, name: { type: 'string' }, qtyPerUnit: { type: 'number' }, leadTimeDays: { type: 'number' } }, required: ['partNumber', 'name', 'qtyPerUnit'] } },
        draftRouting: { type: 'array', items: { type: 'object', properties: { sequence: { type: 'integer' }, operation: { type: 'string' }, machineClass: { type: 'string' }, plannedHours: { type: 'number' } }, required: ['sequence', 'operation', 'machineClass', 'plannedHours'] } },
        qcChecklist: { type: 'array', items: { type: 'string' } },
      },
      required: ['customer', 'partName', 'qty', 'material', 'tolerances', 'ambiguities', 'draftBOM', 'draftRouting', 'qcChecklist'],
    };
    const cacheKey = `extract-rfq:${principal.workspaceId}:${createHash('sha256').update(rfqText).digest('hex')}`;
    const result = await callGeminiStructured(prompt, cacheKey, { responseSchema });
    if (!result.aiResult) return NextResponse.json({ aiResult: null, reason: result.reason ?? 'unavailable', error: 'RFQ extraction is unavailable. Retry later.' });
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
