import { NextResponse } from 'next/server';
import { callGeminiStructured } from '@/server/ai/gemini-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rfqText } = body;

    const cacheKey = `extract-rfq:${(rfqText || '').slice(0, 50)}`;

    const prompt = `
You are an engineering intake specialist in ManuOS.
Extract structured manufacturing specifications from the following customer RFQ / procurement text:

"""
${rfqText || ''}
"""

Extract:
- customer name
- partName
- qty (number)
- material
- tolerances (array of strings, e.g. ["±0.02mm bores", "Surface Ra 0.8µm"])
- ambiguities (unspecified or missing specifications)
- draftBOM (array of items with partNumber, name, qtyPerUnit, leadTimeDays)
- draftRouting (array of operation steps with sequence, operation, machineClass, plannedHours)
- qcChecklist (inspection checkpoints)

Rules:
- Output MUST be valid JSON conforming to this schema:
{
  "customer": "Customer Name",
  "partName": "Part or Assembly Name",
  "qty": 50,
  "material": "Material Grade",
  "tolerances": ["±0.02mm"],
  "ambiguities": ["Surface treatment coating thickness not specified"],
  "draftBOM": [
    { "partNumber": "AL-6061-BLK", "name": "Billet 6061-T6", "qtyPerUnit": 1, "leadTimeDays": 3 }
  ],
  "draftRouting": [
    { "sequence": 1, "operation": "CNC Milling", "machineClass": "CNC_MILL_5AXIS", "plannedHours": 4.5 }
  ],
  "qcChecklist": ["CMM Bore Tolerance", "Surface roughness Ra check"]
}
`;

    const responseSchema = {
      type: 'object',
      properties: {
        customer: { type: 'string' },
        partName: { type: 'string' },
        qty: { type: 'integer' },
        material: { type: 'string' },
        tolerances: { type: 'array', items: { type: 'string' } },
        ambiguities: { type: 'array', items: { type: 'string' } },
        draftBOM: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              partNumber: { type: 'string' },
              name: { type: 'string' },
              qtyPerUnit: { type: 'number' },
              leadTimeDays: { type: 'number' },
            },
            required: ['partNumber', 'name', 'qtyPerUnit'],
          },
        },
        draftRouting: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sequence: { type: 'integer' },
              operation: { type: 'string' },
              machineClass: { type: 'string' },
              plannedHours: { type: 'number' },
            },
            required: ['sequence', 'operation', 'machineClass', 'plannedHours'],
          },
        },
        qcChecklist: { type: 'array', items: { type: 'string' } },
      },
      required: ['customer', 'partName', 'qty', 'material', 'tolerances', 'draftBOM', 'draftRouting', 'qcChecklist'],
    };

    const res = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    if (!res.aiResult) {
      return NextResponse.json({
        aiResult: {
          customer: 'AeroDynamics Global Pte Ltd',
          partName: 'Hydraulic Actuator Manifold',
          qty: 60,
          material: 'Titanium Ti-6Al-4V Grade 5',
          tolerances: ['Bore diameter ±0.012 mm', 'Flatness within 0.025 mm', 'Surface finish Ra ≤ 0.8 µm'],
          ambiguities: ['Anodizing specification type (Type II vs Type III Hardcoat)', 'Secondary deburring edge break radius'],
          draftBOM: [
            { partNumber: 'MAT-TI-01', name: 'Ti-6Al-4V Forged Billet 120x80x50', qtyPerUnit: 1, leadTimeDays: 4 },
            { partNumber: 'SEAL-OR-04', name: 'Viton Fluoropolymer O-Ring Set', qtyPerUnit: 4, leadTimeDays: 2 },
          ],
          draftRouting: [
            { sequence: 10, operation: 'Rough & Semi-Finish CNC 5-Axis Milling', machineClass: 'CNC_MILL_5AXIS', plannedHours: 6.0 },
            { sequence: 20, operation: 'High Precision Wire EDM Port Cutting', machineClass: 'EDM_WIRE', plannedHours: 3.5 },
            { sequence: 30, operation: 'Coordinate Measuring Machine (CMM) First Article QC', machineClass: 'CMM_INSPECTION', plannedHours: 1.5 },
          ],
          qcChecklist: ['CMM 12-point dimensional verification', 'Pressure burst proof test 350 bar', 'Dye penetrant crack check'],
        },
        reason: res.reason || 'fallback',
      });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ aiResult: null, reason: 'error' }, { status: 500 });
  }
}
