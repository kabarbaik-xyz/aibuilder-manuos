import type { callGeminiStructured } from '@/server/ai/gemini-client';

/** Deterministic provider boundary for specs; production must call its configured model. */
export const fixtureBuilderAI: typeof callGeminiStructured = async <T>(prompt: string) => {
  const context = JSON.parse(prompt.split('WORKSPACE_CONTEXT: ')[1].split('\nUSER_REQUIREMENTS: ')[0]) as { target: string; purpose?: string };
  const definition = context.target === 'WORKFLOW' ? {
    schemaVersion: 1, name: 'Fixture CNC routing',
    nodes: [
      { key: 'OP10_PREP', name: 'Preparation', type: 'OPERATION', plannedDurationMinutes: 30 },
      { key: 'OP20_MILL', name: 'CNC milling', type: 'OPERATION', plannedDurationMinutes: 60 },
      { key: 'QC30_INSPECT', name: 'Inspection', type: 'INSPECTION', plannedDurationMinutes: 15 },
    ],
    edges: [{ fromNodeKey: 'OP10_PREP', toNodeKey: 'OP20_MILL', joinPolicy: 'AND' }, { fromNodeKey: 'OP20_MILL', toNodeKey: 'QC30_INSPECT', joinPolicy: 'AND' }],
  } : {
    schemaVersion: 1, purpose: context.purpose ?? 'QC_EVIDENCE',
    fields: [
      { key: 'inspection_result', label: 'Inspection disposition', kind: 'select', required: true, options: [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }] },
      { key: 'defect_notes', label: 'Defect details', kind: 'textarea', required: true, visibleWhen: { fieldKey: 'inspection_result', operator: 'equals', value: 'fail' } },
      { key: 'measured_dimensions', label: 'Measured tolerance (mm)', kind: 'decimal', precision: 2, required: false },
    ],
  };
  return { aiResult: { definitionJson: JSON.stringify(definition), assumptions: ['Fixture-only proposal for domain verification.'], questions: [] } as T };
};
