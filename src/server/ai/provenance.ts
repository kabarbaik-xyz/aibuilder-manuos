export interface AIProvenanceRecord {
  id: string;
  contextHash: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  status: 'SUCCESS' | 'FALLBACK';
  reason?: string;
  timestamp: string;
}

const provenanceLog: AIProvenanceRecord[] = [];

export function recordProvenance(record: Omit<AIProvenanceRecord, 'id' | 'timestamp'>): AIProvenanceRecord {
  const fullRecord: AIProvenanceRecord = {
    id: `prov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...record,
  };
  provenanceLog.push(fullRecord);
  if (provenanceLog.length > 100) {
    provenanceLog.shift();
  }
  return fullRecord;
}

export function getRecentProvenance(): readonly AIProvenanceRecord[] {
  return provenanceLog;
}
