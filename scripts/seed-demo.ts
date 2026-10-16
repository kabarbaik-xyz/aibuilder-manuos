import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import { openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedPermissionsAndRoles } from '../prisma/seed';
import { provisionUser } from '../src/server/auth/provisioning';
import type { Principal } from '../src/server/auth/principal';
import { configurePrismaSqlite } from '../src/server/db/client';
import { MastersService } from '../src/server/modules/masters/service';
import { OrderService } from '../src/server/modules/orders/service';
import { EngineeringService } from '../src/server/modules/engineering/service';
import { WorkflowService } from '../src/server/modules/workflow/service';
import { releaseOrder } from '../src/server/modules/orders/release';
import { SupplyService } from '../src/server/modules/supply/service';
import { InventoryService } from '../src/server/modules/inventory/service';
import { PlanningService } from '../src/server/modules/planning/service';
import { ExecutionService } from '../src/server/modules/execution/service';
import { recordOutput } from '../src/server/modules/execution/output';
import { createInspection, finalizeInspection, authorizeRework, recordReinspection } from '../src/server/modules/quality/service';
import { DeliveryService } from '../src/server/modules/delivery/service';
import { AccessService } from '../src/server/modules/access/service';
import { FormService } from '../src/server/modules/forms/service';
import { parseQuantity } from '../src/domain/quantity';

const VERSION = 'demo-v1';
export const SCENARIOS = ['draft', 'engineering', 'shortage', 'reserved', 'running', 'paused', 'waiting-qc', 'rework', 'scrap', 'allocated', 'in-transit', 'delivered'] as const;
const ROLES = ['OWNER', 'ACCESS_ADMIN', 'ENGINEER', 'PLANNER', 'WAREHOUSE', 'QC', 'SALES', 'BUYER'];
const FAMILIES = [
  ['BRACKET', 'Precision mounting bracket', 'CNC milling'],
  ['VALVE', 'Hydraulic valve body', 'Precision turning'],
  ['PANEL', 'Industrial control panel', 'Panel assembly'],
  ['HOUSING', 'Motor enclosure', 'Housing machining'],
  ['FLANGE', 'Stainless process flange', 'Flange finishing'],
  ['FRAME', 'Welded equipment frame', 'Frame fabrication'],
] as const;

/** Service commands own every operational write. Receipts allow resuming even
 * commands whose domain preconditions no longer hold after successful execution.
 * A repeat preserves subsequent demo interaction; it never resets user work. */
export async function seedDemo(db: PrismaClient, options: { workspaceCode?: string; anchor?: string; password: string }) {
  const workspaceCode = options.workspaceCode || 'DEMO';
  if (options.password.length < 12) throw new Error('Demo password must have at least 12 characters');
  const foundWorkspace = await db.workspace.findUnique({ where: { code: workspaceCode } });
  if (!foundWorkspace || !foundWorkspace.isDemo) throw new Error('Target must be an existing workspace marked isDemo=true. Run db:seed for the default DEMO workspace.');
  const workspace = foundWorkspace;
  await seedPermissionsAndRoles(db, workspace.id);
  const operatorEmail = `seed.${workspace.code.toLowerCase()}@manuos.test`;
  const newAccounts: string[] = [];
  let actor = await db.user.findUnique({ where: { email: operatorEmail } });
  if (!actor) {
    newAccounts.push(operatorEmail);
    actor = (await provisionUser({ name: 'Demo Operations Lead', email: operatorEmail, password: options.password, workspaceId: workspace.id, roleCodes: ROLES }, db)).user;
  }
  const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.id } }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
  if (!membership || membership.status !== 'ACTIVE') throw new Error('Demo seed actor is not an active workspace member');
  const principal: Principal = { userId: actor.id, email: actor.email, name: actor.name, membershipId: membership.id, workspaceId: workspace.id, workspaceName: workspace.name, roles: membership.roles.map(r => r.role.code), permissions: new Set(membership.roles.filter(r => r.role.isActive).flatMap(r => r.role.permissions.map(p => p.permissionCode))), customerId: null, technicianId: null };
  const prefix = `${VERSION}:${workspace.code}:`;
  async function step<T>(key: string, command: (idempotencyKey: string) => Promise<T>): Promise<T> {
    const receipt = await db.commandReceipt.findUnique({ where: { workspaceId_principalId_key: { workspaceId: workspace.id, principalId: actor!.id, key: prefix + key } } });
    if (receipt) return { data: JSON.parse(receipt.resultJson) } as T;
    return command(prefix + key);
  }
  // Anchor is persisted by the first command so interrupted/repeated runs retain
  // identical dates. It is metadata, not a manufactured operational state.
  const existing = await db.order.findFirst({ where: { workspaceId: workspace.id, rfqDrafts: { some: { rawText: { startsWith: `${VERSION} anchor=` } } } }, include: { rfqDrafts: true } });
  const previousAnchor = existing?.rfqDrafts.find(r => r.rawText.startsWith(`${VERSION} anchor=`))?.rawText.split('\n')[0].split('anchor=')[1];
  const anchor = new Date(previousAnchor || options.anchor || new Date().toISOString().slice(0, 10));
  if (Number.isNaN(anchor.getTime())) throw new Error('Invalid anchor date');
  const day = (offset: number) => new Date(anchor.getTime() + offset * 86400000).toISOString();
  const masters = new MastersService(db), orders = new OrderService(db), engineering = new EngineeringService(db), workflows = new WorkflowService(db);
  const inventory = new InventoryService(db), supply = new SupplyService(db), planning = new PlanningService(db), execution = new ExecutionService(db), delivery = new DeliveryService(db);
  const pcs = (await step('uom-pcs', k => masters.createUom(principal, { code: 'DM-PCS', name: 'Demo pieces', dimension: 'PIECE', precision: 0 }, k))).data;
  const kg = (await step('uom-kg', k => masters.createUom(principal, { code: 'DM-KG', name: 'Demo kilograms', dimension: 'WEIGHT', precision: 3 }, k))).data;
  const customers: Array<{ id: string }> = [];
  for (const [i, name] of ['Meridian Energy', 'Astra Components', 'Northstar Electric', 'Pacific Systems', 'Vertex Industries', 'Harbor Engineering', 'Apex Automation', 'Sentosa Marine', 'Nusantara Rail', 'Orion Medical', 'Summit Robotics', 'Cendana Packaging'].entries()) {
    customers.push((await step(`customer-${i}`, k => masters.createCustomer(principal, { code: `DM-C${i + 1}`, name, email: `purchasing${i + 1}@customer.example.test`, address: `${i + 10} Industrial Avenue, Singapore` }, k))).data);
  }
  const suppliers: Array<{ id: string }> = [];
  for (const [i, name] of ['Titan Alloys', 'Nusantara Metalcraft', 'Pacific Steel', 'Precision Fasteners', 'Batam Industrial Supply', 'Surya Electrical'].entries()) suppliers.push((await step(`supplier-${i}`, k => masters.createSupplier(principal, { code: `DM-S${i + 1}`, name, leadTimeDays: 3 + i * 2, contactEmail: `sales${i + 1}@supplier.example.test` }, k))).data);
  const locations = new Map<string, string>();
  for (const kind of ['RAW', 'WIP', 'QUARANTINE', 'FG', 'SCRAP', 'CUSTOMER'] as const) locations.set(kind, (await step(`location-${kind}`, k => masters.createLocation(principal, { code: `DM-${kind}`, name: `Demo ${kind.toLowerCase()} area`, kind, warehouseGroup: 'DEMO' }, k))).data.id);
  const loc = (kind: string) => locations.get(kind)!;
  const calendar = (await step('calendar', k => masters.createCalendar(principal, { code: 'DM-DAY', name: 'Demo day shift', timezone: 'Asia/Jakarta', weeklyShiftsJson: JSON.stringify([1, 2, 3, 4, 5, 6].map(dayOfWeek => ({ dayOfWeek, start: '07:00', end: '15:00' }))) }, k))).data;
  const skill = (await step('skill', k => masters.createSkill(principal, { code: 'DM-MACHINING', name: 'Precision manufacturing', scaleMax: 5 }, k))).data;
  const certification = (await step('cert', k => masters.createCertification(principal, { code: 'DM-SAFETY', name: 'Machine safety authorization', issuer: 'Demo Training Centre' }, k))).data;
  const checklist = (await step('checklist', k => masters.createQcChecklist(principal, { code: 'DM-FINAL', name: 'Final dimensional and surface inspection', checks: [{ code: 'DIM', description: 'Dimension within drawing tolerance', method: 'MEASUREMENT', unit: 'mm', limitsJson: '{"min":"24.95","max":"25.05"}', isRequired: true }, { code: 'SURFACE', description: 'No burrs, cracks or surface damage', method: 'VISUAL', isRequired: true }] }, k))).data;
  const catalog: Array<{ rawId: string; fgId: string; typeId: string; workflowId: string; techId: string; machineId: string }> = [];
  for (const [f, [code, name, operation]] of FAMILIES.entries()) {
    const department = (await step(`dept-${f}`, k => masters.createDepartment(principal, { code: `DM-${code}`, name: `${operation} cell` }, k))).data;
    const machineClass = (await step(`class-${f}`, k => masters.createMachineClass(principal, { code: `DM-${code}`, name: `${operation} equipment` }, k))).data;
    const machine = (await step(`machine-${f}`, k => masters.createMachine(principal, { code: `DM-M${f + 1}`, name: `${operation} station ${f + 1}`, machineClassId: machineClass.id, departmentId: department.id, calendarId: calendar.id }, k))).data;
    await step(`machine-spare-${f}`, k => masters.createMachine(principal, { code: `DM-M${f + 7}`, name: `${operation} backup`, machineClassId: machineClass.id, departmentId: department.id, calendarId: calendar.id, status: f % 2 ? 'MAINTENANCE' : 'AVAILABLE' }, k));
    const tech = (await step(`tech-${f}`, k => masters.createTechnician(principal, { code: `DM-T${f + 1}`, name: ['Hendra Wijaya', 'Rina Putri', 'Marco Santoso', 'Budi Pratama', 'Siti Rahma', 'Adi Nugroho'][f], departmentId: department.id, calendarId: calendar.id }, k))).data;
    await step(`skill-${f}`, k => masters.assignSkill(principal, tech.id, { skillId: skill.id, level: 3 + f % 2 }, k));
    await step(`cert-${f}`, k => masters.assignCert(principal, tech.id, { certificationId: certification.id, certificateNumber: `DM-CERT-${f + 1}`, issuedDate: day(-180).slice(0, 10), validUntil: day(f === 5 ? -5 : 365).slice(0, 10) }, k));
    const raw = (await step(`raw-${f}`, k => masters.createItem(principal, { code: `DM-RAW-${code}`, name: `${name} blank`, itemType: 'RAW', baseUomId: pcs.id, tracking: 'LOT' }, k))).data;
    const fg = (await step(`fg-${f}`, k => masters.createItem(principal, { code: `DM-FG-${code}`, name, itemType: 'FINISHED', baseUomId: pcs.id, tracking: 'LOT' }, k))).data;
    const type = (await step(`type-${f}`, k => masters.createOrderType(principal, { code: `DM-${code}`, name: `${name} make to order` }, k))).data;
    const template = (await step(`workflow-${f}`, k => workflows.createTemplate(principal, { code: `DM-WF-${code}`, name: `${operation} batch route`, orderTypeId: type.id }, k))).data;
    await step(`workflow-save-${f}`, k => workflows.saveVersionDraft(principal, template.initialVersionId, { definition: { schemaVersion: 1, name: `${operation} batch route`, nodes: [{ key: 'OP-10', name: operation, type: 'OPERATION', departmentId: department.id, plannedDurationMinutes: 45 + f * 15, requirements: { machineClassId: machineClass.id, requiredSkills: [{ skillId: skill.id, minLevel: 3 }] } }], edges: [] } }, k));
    await step(`workflow-publish-${f}`, k => workflows.publishVersion(principal, template.initialVersionId, k));
    catalog.push({ rawId: raw.id, fgId: fg.id, typeId: type.id, workflowId: template.initialVersionId, techId: tech.id, machineId: machine.id });
    await step(`opening-${f}`, k => inventory.postOpeningBalance(principal, { itemId: raw.id, locationId: loc('RAW'), atoms: parseQuantity('5000'), lotNumber: `DM-OPEN-${f}`, notes: 'Demo opening stock; independent supplier lots below' }, k));
  }
  // Fractional units and real zero/low stock contrast with stocked batch blanks.
  for (const [i, name] of ['Aluminium 6061 plate', 'Stainless 316 bar', 'Welding wire', 'Powder coating', 'Copper busbar', 'Hydraulic oil'].entries()) {
    const item = (await step(`bulk-${i}`, k => masters.createItem(principal, { code: `DM-BULK-${i + 1}`, name, itemType: 'RAW', baseUomId: kg.id, tracking: 'LOT' }, k))).data;
    if (i !== 5) await step(`bulk-opening-${i}`, k => inventory.postOpeningBalance(principal, { itemId: item.id, locationId: loc('RAW'), atoms: parseQuantity(i === 4 ? '2.125' : `${150 + i * 25}.375`), lotNumber: `DM-BULK-LOT-${i}`, notes: 'Demo fractional-weight stock' }, k));
  }
  const shortageRaw = (await step('shortage-item', k => masters.createItem(principal, { code: 'DM-RAW-SHORT', name: 'Special alloy blank — awaiting supplier', itemType: 'RAW', baseUomId: pcs.id, tracking: 'LOT' }, k))).data;
  // 24 supply orders: draft, approved overdue, partial receipt and received.
  for (let i = 0; i < 24; i++) {
    const po = (await step(`po-${i}`, k => supply.createSupplyOrder(principal, { supplierId: suppliers[i % suppliers.length].id, expectedDate: day(i % 4 === 1 ? -3 : 4 + i % 10), notes: `Demo supply case ${['draft', 'overdue awaiting receipt', 'partial receipt', 'fully received'][i % 4]}`, lines: [{ itemId: i % 4 === 1 ? shortageRaw.id : catalog[i % 6].rawId, orderedAtoms: parseQuantity('400').toString(), unitPriceCents: 12500 + i * 500 }] }, k))).data;
    if (i % 4 === 0) continue;
    await step(`po-approve-${i}`, k => supply.approveSupplyOrder(principal, po.id, k));
    if (i % 4 >= 2) await step(`po-receive-${i}`, k => supply.receiveSupply(principal, { supplyOrderId: po.id, notes: 'Demo supplier receipt', lines: [{ supplyOrderLineId: po.lines[0].id, locationId: loc('RAW'), receivedAtoms: parseQuantity(i % 4 === 2 ? '150' : '400').toString(), lotNumber: `DM-PO-LOT-${i}`, supplierLotNumber: `MILL-HEAT-${2000 + i}` }] }, k));
  }
  const scenarioOrders: Array<{ scenario: string; orderNumber: string; orderId: string; quantity: number }> = [];
  for (let i = 0; i < 72; i++) {
    const scenario = SCENARIOS[i % SCENARIOS.length], family = Math.floor(i / SCENARIOS.length), c = catalog[family], quantity = 40 + family * 20;
    const order = (await step(`order-${i}`, k => orders.createOrderDraft(principal, { customerId: customers[(i + family) % customers.length].id, orderTypeId: c.typeId, itemId: c.fgId, orderedQuantity: quantity, requestedDate: day(i % 3 === 0 ? -2 : 5 + i % 18), promisedDate: day(i % 3 === 0 ? -1 : 7 + i % 18), rfqText: `${VERSION} anchor=${anchor.toISOString()}\nScenario: ${scenario} | Family: ${FAMILIES[family][0]}\nManufacture ${quantity} units to approved drawing. Preserve lot traceability and final QC evidence.`, rfqSourceType: 'MANUAL' }, k))).data;
    scenarioOrders.push({ scenario, orderId: order.id, orderNumber: order.orderNumber, quantity });
    const revId = order.engineeringRevisions[0].id;
    if (scenario === 'draft') continue;
    await step(`engineering-${i}`, k => engineering.saveEngineeringDraft(principal, revId, { workflowVersionId: c.workflowId, bomLines: [{ operationNodeKey: 'OP-10', itemId: scenario === 'shortage' ? shortageRaw.id : c.rawId, inputUomId: pcs.id, requirementQuantity: 1, outputBasis: 1, allowancePercent: 0 }] }, k));
    if (scenario === 'engineering') { await step(`question-${i}`, k => orders.addCustomerQuestion(principal, order.id, { question: 'Please confirm surface finish and drawing revision before engineering approval.' }, k)); continue; }
    await step(`approve-${i}`, k => engineering.approveEngineeringRevision(principal, revId, k));
    const released = (await step(`release-${i}`, k => releaseOrder(principal, order.id, k, db))).data;
    const taskId = released.taskIds['OP-10'];
    if (scenario === 'shortage') continue;
    const demand = await db.materialDemand.findFirstOrThrow({ where: { workspaceId: workspace.id, orderId: order.id } });
    const lot = await db.lot.findFirstOrThrow({ where: { workspaceId: workspace.id, lotNumber: `DM-OPEN-${family}` } });
    const reservation = (await step(`reserve-${i}`, k => inventory.reserveStock(principal, { demandId: demand.id, locationId: loc('RAW'), lotId: lot.id, atoms: parseQuantity(String(quantity)) }, k))).data;
    // Non-overlapping resource bookings cover current and future shifts.
    const start = new Date(anchor.getTime() + (2 + Math.floor(i / 6)) * 86400000 + (i % 6) * 7200000);
    await step(`assign-${i}`, k => planning.assignTask(principal, { taskId, expectedVersion: 1, technicianId: c.techId, machineId: c.machineId, startAt: start.toISOString(), endAt: new Date(start.getTime() + (45 + family * 15) * 60000).toISOString() }, k));
    if (scenario === 'reserved') continue;
    await step(`issue-${i}`, k => inventory.issueToProduction(principal, { demandId: demand.id, sourceLocationId: loc('RAW'), sourceLotId: lot.id, wipLocationId: loc('WIP'), atoms: parseQuantity(String(quantity)), reservationId: reservation.id }, k));
    await step(`start-${i}`, k => execution.startTask(principal, { taskId, notes: `Demo ${scenario} batch` }, k));
    if (scenario === 'running') continue;
    if (scenario === 'paused') { await step(`pause-${i}`, k => execution.pauseTask(principal, { taskId, reason: 'TOOL_CHANGE', notes: 'Waiting for replacement cutting insert' }, k)); continue; }
    const output = (await step(`output-${i}`, k => recordOutput(db, principal, { taskId, outputAtoms: parseQuantity(String(quantity)), destinationLocationId: loc('QUARANTINE'), lotNumber: `DM-FG-LOT-${i}`, isFinal: true, notes: `Demo ${scenario} output` }, k))).data.output;
    const inspection = (await step(`inspection-${i}`, k => createInspection(db, principal, { sourceType: 'PRODUCTION_OUTPUT', productionOutputId: output.id, qcChecklistId: checklist.id, inspectedAtoms: parseQuantity(String(quantity)), notes: `Demo ${scenario} inspection` }, k))).data;
    if (scenario === 'waiting-qc') continue;
    const reworkUnits = scenario === 'rework' ? 4 : 0, scrapUnits = scenario === 'scrap' ? 3 : 0;
    await step(`qc-finalize-${i}`, k => finalizeInspection(db, principal, { inspectionId: inspection.id, passedAtoms: parseQuantity(String(quantity - reworkUnits - scrapUnits)), reworkAtoms: parseQuantity(String(reworkUnits)), scrappedAtoms: parseQuantity(String(scrapUnits)), destinationFgLocationId: loc('FG'), destinationScrapLocationId: loc('SCRAP'), results: [{ checkCode: 'DIM', checkDescription: 'Dimension within drawing tolerance', measuredValue: '25.01', isPassed: true }, { checkCode: 'SURFACE', checkDescription: 'No burrs, cracks or surface damage', isPassed: !reworkUnits && !scrapUnits, ...(reworkUnits || scrapUnits ? { defectReason: reworkUnits ? 'Burrs require deburring and reinspection' : 'Surface crack; scrap disposition' } : {}) }] }, k));
    if (scenario === 'rework') {
      const rework = (await step(`rework-${i}`, k => authorizeRework(db, principal, { inspectionId: inspection.id, targetAtoms: parseQuantity('4'), instruction: 'Deburr edges, clean, and reinspect surface finish.' }, k))).data;
      if (family % 2) await step(`reinspect-${i}`, k => recordReinspection(db, principal, { originalInspectionId: inspection.id, reworkAttemptId: rework.id, passedAtoms: parseQuantity('4'), scrappedAtoms: 0n, destinationFgLocationId: loc('FG'), results: [{ checkCode: 'SURFACE-RECHECK', checkDescription: 'Burr removed after rework', isPassed: true }] }, k));
      continue;
    }
    if (scenario === 'scrap') continue;
    const shipment = (await step(`shipment-${i}`, k => delivery.allocateShipment(principal, { orderId: order.id, carrierName: ['DHL Supply Chain', 'Ninja Logistics', 'Precision Transport'][family % 3], trackingNumber: `DM-TRACK-${i}`, lines: [{ itemId: c.fgId, lotId: output.lotId || undefined, sourceLocationId: loc('FG'), allocatedAtoms: (scenario === 'in-transit' ? parseQuantity(String(quantity)) / 2n : parseQuantity(String(quantity))) }] }, k))).data;
    if (scenario === 'allocated') continue;
    await step(`dispatch-${i}`, k => delivery.dispatchShipment(principal, { shipmentId: shipment.id }, k));
    if (scenario === 'delivered') await step(`delivered-${i}`, k => delivery.confirmDelivery(principal, { shipmentId: shipment.id, receivedBy: 'Customer receiving team', proofOfDelivery: `DEMO-POD-${i}`, notes: 'Demo delivery confirmed in good condition' }, k));
    console.log(`${order.orderNumber}: ${scenario}`);
  }
  // Role-specific demo accounts use the access domain, including customer and
  // technician scoping. Existing accounts/passwords are never overwritten.
  const access = new AccessService(db);
  const demoUsers = [
    { name: 'Demo Planner', code: 'planner', roles: ['PLANNER'] },
    { name: 'Demo Buyer', code: 'buyer', roles: ['BUYER'] },
    { name: 'Demo Warehouse', code: 'warehouse', roles: ['WAREHOUSE'] },
    { name: 'Demo Quality Inspector', code: 'qc', roles: ['QC'] },
    { name: 'Demo Sales', code: 'sales', roles: ['SALES'] },
    { name: 'Demo Engineer', code: 'engineer', roles: ['ENGINEER'] },
    ...catalog.map((c, i) => ({ name: `Demo Operator ${i + 1}`, code: `operator${i + 1}`, roles: ['TECHNICIAN'], technicianId: c.techId })),
    ...customers.slice(0, 3).map((c, i) => ({ name: `Demo Customer ${i + 1}`, code: `customer${i + 1}`, roles: ['CUSTOMER'], customerId: c.id })),
  ];
  for (const account of demoUsers) {
    const email = `${account.code}.${workspace.code.toLowerCase()}@manuos.test`;
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      const link = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: existingUser.id } } });
      if (!link) throw new Error(`Demo account address already belongs to another workspace: ${email}`);
      continue;
    }
    await step(`account-${account.code}`, k => access.createUser(principal, { name: account.name, email, password: options.password, roleCodes: account.roles, customerId: 'customerId' in account ? account.customerId : null, technicianId: 'technicianId' in account ? account.technicianId : null }, k));
    newAccounts.push(email);
  }
  const forms = new FormService(db);
  for (let i = 0; i < 6; i++) {
    const purpose = (['ORDER_SPEC', 'TASK_EVIDENCE', 'QC_EVIDENCE'] as const)[i % 3];
    const code = `DM-FORM-${i + 1}`;
    let template = await db.formTemplate.findUnique({ where: { workspaceId_code: { workspaceId: workspace.id, code } }, include: { versions: { orderBy: { versionNumber: 'asc' } } } });
    if (!template) {
      await forms.createTemplate(principal, { code, name: ['Customer manufacturing requirements', 'Machining setup record', 'Final inspection report', 'Surface finish specification', 'Assembly completion record', 'Incoming material inspection'][i], purpose, description: 'Demo form template; review before binding to operational gates.' });
      template = await db.formTemplate.findUniqueOrThrow({ where: { workspaceId_code: { workspaceId: workspace.id, code } }, include: { versions: { orderBy: { versionNumber: 'asc' } } } });
    }
    const version = template.versions[0];
    const current = JSON.parse(version.definitionJson);
    if (version.status === 'DRAFT' && current.fields.length === 1 && current.fields[0].key === 'notes') {
      await forms.updateDraftVersion(principal, template.id, version.id, { expectedVersion: version.version, definition: { schemaVersion: 1, purpose, fields: [
        { key: 'reference', label: 'Drawing / specification reference', kind: 'text', required: true },
        { key: 'result', label: 'Review result', kind: 'select', required: true, options: [{ value: 'pass', label: 'Accepted' }, { value: 'review', label: 'Requires review' }] },
        { key: 'measurement', label: 'Measured dimension (mm)', kind: 'decimal', required: false, precision: 3, min: '0' },
        { key: 'review_notes', label: 'Review notes', kind: 'textarea', required: true, visibleWhen: { fieldKey: 'result', operator: 'equals', value: 'review' } },
      ] } });
    }
    const updated = await db.formVersion.findUniqueOrThrow({ where: { id: version.id } });
    if (i % 3 === 1 && updated.status === 'DRAFT') await forms.submitReview(principal, template.id, version.id, { expectedVersion: updated.version });
    if (i % 3 === 2 && updated.status === 'DRAFT') await forms.publishFormVersion(principal, { templateId: template.id, versionId: version.id, expectedVersion: updated.version });
  }
  const reconciliation = await inventory.reconcile(principal);
  if (!reconciliation.balanced) throw new Error(`Ledger reconciliation failed: ${JSON.stringify(reconciliation.mismatches)}`);
  const fkErrors = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
  if (fkErrors.length) throw new Error('Foreign key reconciliation failed');
  return { version: VERSION, workspace: workspace.code, anchor: anchor.toISOString(), seedActor: operatorEmail, newAccounts, scenarioOrders, reconciliation: { balanced: true, foreignKeyErrors: 0 } };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production');
  const db = new PrismaClient();
  const lockPath = path.join(tmpdir(), `manuos-seed-${createHash('sha256').update(process.env.DATABASE_URL || 'default').digest('hex').slice(0, 16)}.lock`);
  const lock = openSync(lockPath, 'wx');
  try {
    await configurePrismaSqlite(db);
    const password = process.env.DEMO_SEED_PASSWORD || randomBytes(24).toString('base64url');
    const report = await seedDemo(db, { workspaceCode: process.env.DEMO_SEED_WORKSPACE || 'DEMO', anchor: process.env.DEMO_SEED_ANCHOR, password });
    if (report.newAccounts.length) {
      const credentialsPath = path.join(tmpdir(), `manuos-demo-credentials-${Date.now()}.json`);
      writeFileSync(credentialsPath, JSON.stringify({ workspace: report.workspace, password, accounts: report.newAccounts }, null, 2), { mode: 0o600 });
      console.log(`New demo account credentials (local file, permissions 0600): ${credentialsPath}`);
    }
    const reportPath = path.resolve('prisma/data/demo-seed-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Demo seed complete: ${report.scenarioOrders.length} orders across ${SCENARIOS.length} scenarios. Ledger balanced; foreign keys valid. Report: ${reportPath}`);
    console.log('Existing logins remain unchanged. Set DEMO_SEED_PASSWORD before the first run to use the dedicated demo seed account.');
  } finally { await db.$disconnect(); closeSync(lock); unlinkSync(lockPath); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
