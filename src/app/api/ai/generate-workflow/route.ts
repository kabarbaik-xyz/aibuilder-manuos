import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderTypeName, description, companyProfile } = body;

    const cacheKey = `generate-workflow:${(orderTypeName || 'std').toLowerCase()}`;

    const prompt = `
You are a manufacturing process engineer in ManuOS.
Propose a Directed Acyclic Graph (DAG) workflow for:
Order Type: ${orderTypeName || 'Standard Production'}
Description: ${description || ''}
Company Profile: ${JSON.stringify(companyProfile || {})}

Rules:
- Nodes must be manufacturing tasks with planned hours, department, and required machine class.
- Edges must define strict precedence (from -> to) without cyclic loops.
- Output MUST be valid JSON conforming to this schema:
{
  "nodes": [
    { "id": "task-1", "name": "Billet Preparation", "department": "Prep", "plannedHours": 2, "machineClass": "SAW" },
    { "id": "task-2", "name": "5-Axis Milling", "department": "Machining", "plannedHours": 6, "machineClass": "CNC_MILL_5AXIS" },
    { "id": "task-3", "name": "QC Inspection", "department": "QA", "plannedHours": 1.5, "machineClass": "CMM_INSPECTION" }
  ],
  "edges": [
    { "from": "task-1", "to": "task-2" },
    { "from": "task-2", "to": "task-3" }
  ],
  "transitionRules": ["All machining must pass CMM check before finishing"],
  "warnings": []
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              department: { type: 'string' },
              plannedHours: { type: 'number' },
              machineClass: { type: 'string' },
            },
            required: ['id', 'name', 'department', 'plannedHours'],
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              condition: { type: 'string' },
            },
            required: ['from', 'to'],
          },
        },
        transitionRules: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['nodes', 'edges', 'transitionRules', 'warnings'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: {
          nodes: [
            { id: 'wf-1', name: 'Material Preparation & Saw Cut', department: 'Preparation', plannedHours: 2.5, machineClass: 'BANDSAW' },
            { id: 'wf-2', name: '5-Axis CNC Roughing & Finishing', department: 'Machining', plannedHours: 8.0, machineClass: 'CNC_MILL_5AXIS' },
            { id: 'wf-3', name: 'Precision Deburring & Ultrasonic Clean', department: 'Finishing', plannedHours: 2.0, machineClass: 'CLEAN_BENCH' },
            { id: 'wf-4', name: 'CMM Dimensional & Pressure Proof Inspection', department: 'Quality', plannedHours: 3.0, machineClass: 'CMM_INSPECTION' },
            { id: 'wf-5', name: 'Final Assembly & Packaging', department: 'Packaging', plannedHours: 1.5, machineClass: 'PACKAGING_STATION' },
          ],
          edges: [
            { from: 'wf-1', to: 'wf-2' },
            { from: 'wf-2', to: 'wf-3' },
            { from: 'wf-3', to: 'wf-4' },
            { from: 'wf-4', to: 'wf-5' },
          ],
          transitionRules: [
            'CMM inspection requires valid calibration certificate within 30 days',
            'Pressure test record must be signed off by QC lead before packaging',
          ],
          warnings: ['5-Axis CNC Mill MCH-02 has 91% booking; buffer recommended.'],
        },
        reason: res.reason || 'fallback',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ aiResult: null, reason: 'error' }, { status: 500 });
  }
}
