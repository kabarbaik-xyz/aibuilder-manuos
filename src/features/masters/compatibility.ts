// Presentation adapters for the legacy master screens. Server records remain authoritative.
const itemTypes: Record<string, string> = { RAW_MATERIAL: 'RAW', COMPONENT: 'COMPONENT', SUBASSEMBLY: 'WIP', FINISHED_GOOD: 'FINISHED' };
const displayItemTypes: Record<string, string> = { RAW: 'RAW_MATERIAL', COMPONENT: 'COMPONENT', WIP: 'SUBASSEMBLY', FINISHED: 'FINISHED_GOOD' };
export function normalizeMasterRecord(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeMasterRecord);
  if (!value || typeof value !== 'object') return value;
  const result = { ...value };
  if ('isActive' in value && !('status' in value)) result.status = value.archivedAt ? 'ARCHIVED' : value.isActive ? 'ACTIVE' : 'INACTIVE';
  if (value.itemType) { result.type = displayItemTypes[value.itemType] || value.itemType; result.isLotTracked = value.tracking === 'LOT'; result.isSerialTracked = value.tracking === 'SERIAL'; }
  if (value.kind) { result.type = value.kind === 'FG' ? 'FINISHED_GOODS' : value.kind; result.isReceiving = ['RAW', 'QUARANTINE'].includes(value.kind); result.isPickable = !['QUARANTINE','SCRAP','CONSUMED'].includes(value.kind); }
  if (value.machineClass && typeof value.machineClass === 'object') { result.machineClassId = value.machineClass.id; result.machineClass = value.machineClass.name; }
  if (value.weeklyShiftsJson !== undefined) result.weeklyJson = value.weeklyShiftsJson;
  if (value.inputUomId) { result.toUomId = value.inputUomId; result.toUom = value.inputUom; }
  if (value.conversions) result.conversions = value.conversions.map(normalizeMasterRecord);
  return result;
}
export function masterRequestBody(url: string, data: any, method: string): any {
  if (url === '/api/items' && method === 'POST') {
    if (data.isLotTracked && data.isSerialTracked) throw new Error('Choose either lot or serial tracking.');
    if (data.type === 'CONSUMABLE') throw new Error('Consumable items are not supported by this item catalog yet.');
    return { ...data, itemType: data.itemType || itemTypes[data.type], tracking: data.tracking || (data.isSerialTracked ? 'SERIAL' : data.isLotTracked ? 'LOT' : 'NONE') };
  }
  if (url === '/api/locations' && method === 'POST') return { ...data, kind: data.kind || (data.type === 'FINISHED_GOODS' ? 'FG' : data.type) };
  if (url === '/api/resources/machines' && method === 'POST') return { ...data, machineClassId: data.machineClassId || data.machineClass };
  if (url === '/api/resources/calendars' && method === 'POST') return { ...data, weeklyShiftsJson: data.weeklyShiftsJson || data.weeklyJson };
  if (/\/calendars\/.+\/exceptions$/.test(url)) return { ...data, workingIntervalsJson: data.workingIntervalsJson || (data.isWorkingDay ? data.intervalsJson || '[]' : '[]') };
  if (/\/items\/.+\/conversions$/.test(url)) {
    let numerator = BigInt(data.factorAtoms); let denominator = 1_000_000n;
    let a = numerator, b = denominator;
    while (b) { const next = a % b; a = b; b = next; }
    numerator /= a; denominator /= a;
    if (!Number.isSafeInteger(Number(numerator))) throw new Error('Conversion is too large.');
    return { inputUomId: data.toUomId, ratioNumerator: Number(numerator), ratioDenominator: Number(denominator) };
  }
  return data;
}
