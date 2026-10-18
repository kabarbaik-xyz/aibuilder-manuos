import type { GraphStoreState } from '@/store/graph-store';
import type { ScreenType } from '@/lib/navigation';

export type DemoSnapshot = Pick<GraphStoreState, 'orders' | 'tasks' | 'materials' | 'machines' | 'technicians' | 'disruption' | 'activeRecovery'>;
export interface DemoSource { id: string; label: string; screen: ScreenType }
export interface DemoAnswer { answer: string; sources: DemoSource[] }

export function demoOverview(state: DemoSnapshot) {
  const active = state.orders.filter(o => o.status !== 'DELIVERED');
  const risks = state.orders.filter(o => o.status === 'AT_RISK' || o.status === 'WATCH');
  const shortages = state.materials.filter(m => m.status === 'DELAYED' || m.quantityInStock < m.quantityReserved);
  return { active, risks, shortages, pending: state.activeRecovery?.status === 'PROPOSED' ? 1 : 0,
    passed: state.orders.reduce((n, o) => n + o.qcPassedQty, 0),
    completed: state.orders.reduce((n, o) => n + o.completedQty, 0),
    machinesAvailable: state.machines.filter(m => m.status === 'AVAILABLE').length };
}

/** Public demo record summaries. No language provider, authenticated API, or writes. */
export function answerDemoQuestion(question: string, state: DemoSnapshot): DemoAnswer {
  const q = question.trim().toLowerCase();
  const overview = demoOverview(state);
  const sources: DemoSource[] = [];
  const respond = (answer: string) => ({ answer, sources });
  if (/\b(approve|apply|delete|create|ship|assign|publish)\b/.test(q)) return respond('Ask AI is read-only. Open the relevant demo view to inspect records. Production changes require an authenticated workspace and the appropriate review.');
  const orderRef = q.match(/(?:#(?:co-\d{4}-)?|order\s*#?)(\d{4,})/i);
  if (orderRef) {
    const order = state.orders.find(o => o.id === orderRef[1] || o.number.toLowerCase().includes(orderRef[1]));
    if (!order) return respond('Order not found in this demo. Ask about a listed order number.');
    sources.push({ id: order.id, label: order.number, screen: 'orders' });
    return respond(`${order.number} · ${order.partName}: ${order.status.replaceAll('_', ' ')}. ${order.qcPassedQty} QC-passed of ${order.orderedQty} ordered; ${order.completedQty} completed. Promised ${order.promisedDate}; expected ${order.expectedDate}.`);
  }
  if (/risk|attention|delay|disrupt|shortage|terlambat|risiko/.test(q)) {
    for (const o of overview.risks) sources.push({ id: o.id, label: o.number, screen: 'orders' });
    for (const m of overview.shortages) sources.push({ id: m.id, label: m.partNumber, screen: 'inventory' });
    return respond(overview.risks.length || overview.shortages.length
      ? `${overview.risks.length} orders need attention and ${overview.shortages.length} material shortage records are present. ${overview.risks.map(o => `${o.number}: expected ${o.expectedDate}, promised ${o.promisedDate}`).join('; ')}. Review affected orders and materials before choosing a recovery action.`
      : 'No at-risk orders or material shortages are recorded in the current demo state. Simulate a delay to explore how the risk review changes.');
  }
  if (/material|stock|inventory|bahan/.test(q)) {
    for (const m of state.materials) sources.push({ id: m.id, label: m.partNumber, screen: 'inventory' });
    return respond(state.materials.map(m => `${m.partNumber}: ${m.quantityInStock} in stock, ${m.quantityReserved} reserved; ${m.status.replaceAll('_', ' ')}${m.status === 'DELAYED' ? `, ETA ${m.etaDate}` : ''}.`).join('\n'));
  }
  if (/machine|cnc|capacity|utilization|mesin/.test(q)) {
    for (const m of state.machines) sources.push({ id: m.id, label: m.name, screen: 'resources' });
    return respond(state.machines.map(m => `${m.name}: ${m.status}, ${m.assignedHoursThisWeek} assigned hours this week; ${m.capacityHoursPerDay} hours daily capacity.`).join('\n') + ' A weekly utilization percentage needs a working calendar; it is not inferred from daily capacity.');
  }
  if (/technician|certif|qualified|operator|teknisi/.test(q)) {
    for (const t of state.technicians) sources.push({ id: t.id, label: t.name, screen: 'resources' });
    return respond(state.technicians.map(t => `${t.name}: ${t.certifications.map(c => `${c.name} valid until ${c.validUntil}`).join(', ') || 'no certifications recorded'}; ${t.assignedHoursThisWeek}/${t.maxWeeklyHours} weekly hours booked.`).join('\n') + ' Qualifications must be checked for the actual task and time window before assignment.');
  }
  if (/running|ready|task|work|jalan/.test(q)) {
    const tasks = state.tasks.filter(t => ['RUNNING', 'READY', 'ASSIGNED'].includes(t.status));
    for (const t of tasks) sources.push({ id: t.id, label: `${t.id} · ${t.name}`, screen: 'orchestrator' });
    return respond(tasks.length ? tasks.map(t => `${t.id} ${t.name}: ${t.status}`).join('; ') + '.' : 'No running, ready, or assigned tasks are recorded.');
  }
  if (/recovery|plan|pemulihan/.test(q)) {
    const recovery = state.activeRecovery;
    if (recovery) sources.push({ id: recovery.orderId, label: `Order ${recovery.orderId}`, screen: 'orders' });
    return respond(recovery ? `Demo recovery ${recovery.id}: ${recovery.status}. ${recovery.triggerEvent}. A full constraint-checked recovery proposal requires the operational workspace; the public demo does not apply production schedules.` : 'No recovery proposal is recorded in this demo session. Review risks and current task evidence first.');
  }
  if (/order|progress|output|pesanan/.test(q)) {
    for (const o of state.orders) sources.push({ id: o.id, label: o.number, screen: 'orders' });
    return respond(`${overview.active.length} active orders. ${overview.passed} QC-passed units and ${overview.completed} completed units across demo orders. ` + state.orders.map(o => `${o.number}: ${o.qcPassedQty}/${o.orderedQty} QC-passed`).join('; ') + '.');
  }
  return respond('This demo supports record summaries for orders, risks, materials, machines, technicians, and active work. Try “Which orders need attention?” or enter a listed order number. Live AI answers and drafting are available through a configured authenticated workspace.');
}
