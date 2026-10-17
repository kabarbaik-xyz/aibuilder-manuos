import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { MastersService } from '@/server/modules/masters/service';
import { ShiftSwapService } from '@/server/modules/masters/shift-swap';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { PlanningService } from '@/server/modules/planning/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/roster/shift-swaps/route';

describe('Transactional shift swaps', () => {
  let fixture: FactoryFixture; let masters: MastersService; let swaps: ShiftSwapService;
  let techB: string; let day = 7;
  const key = () => randomUUID();
  const future = (offset: number, hour = 8) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); date.setUTCHours(hour, 0, 0, 0); return date.toISOString(); };
  beforeAll(async () => {
    fixture = await createFactoryFixture(); masters = new MastersService(fixture.db); swaps = new ShiftSwapService(fixture.db);
    const tech = await masters.createTechnician(fixture.alpha.users.planner.principal, { code: 'SWAP-B', name: 'Second technician', facilityId: fixture.alpha.users.planner.principal.facilityId, maxWeeklyMinutes: 2400 }, key()); techB = tech.data.id;
  });
  afterAll(async () => { await fixture.close(); });
  async function pair() {
    const offset = day; day += 8;
    const shifts = await masters.publishRosterIntervals(fixture.alpha.users.planner.principal, { intervals: [
      { technicianId: fixture.alpha.masters.technicianId, facilityId: fixture.alpha.users.planner.principal.facilityId!, intervalType: 'SHIFT', startAt: future(offset), endAt: future(offset, 16) },
      { technicianId: techB, facilityId: fixture.alpha.users.planner.principal.facilityId!, intervalType: 'SHIFT', startAt: future(offset + 1), endAt: future(offset + 1, 16) },
    ] }, key());
    return { a: shifts.data[0], b: shifts.data[1] };
  }
  const input = (p: Awaited<ReturnType<typeof pair>>) => ({ sourceRosterId: p.a.id, targetRosterId: p.b.id, sourceVersion: p.a.version, targetVersion: p.b.version, reason: 'Exchange operational shifts' });
  async function bookedPair() {
    const p = await pair(); const { alpha } = fixture; const owner = alpha.users.owner.principal;
    const workflow = new WorkflowService(fixture.db); const orders = new OrderService(fixture.db); const engineering = new EngineeringService(fixture.db);
    const template = await workflow.createTemplate(owner, { code: `SWAP-${key()}`, name: 'Swap routing', orderTypeId: alpha.masters.orderTypeId }, key());
    const version = await workflow.saveVersionDraft(owner, template.data.initialVersionId, { definition: { schemaVersion: 1, name: 'Swap routing', nodes: [{ key: 'OP-SWAP', name: 'Qualified operation', type: 'OPERATION', plannedDurationMinutes: 60, requirements: { requiredSkills: [{ skillId: alpha.masters.skillId, minLevel: 3 }] } }], edges: [] } }, key());
    await workflow.submitReview(owner, version.data.id, key()); await workflow.publishVersion(owner, version.data.id, key());
    const order = await orders.createOrderDraft(owner, { customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId, itemId: alpha.masters.fgItemId, orderedQuantity: 1, requestedDate: future(day + 20) }, key());
    const revision = order.data.engineeringRevisions[0]; await engineering.saveEngineeringDraft(owner, revision.id, { workflowVersionId: version.data.id, bomLines: [] }, key()); await engineering.approveEngineeringRevision(owner, revision.id, key());
    const released = await releaseOrder(owner, order.data.id, key(), fixture.db); const task = await fixture.db.task.findFirstOrThrow({ where: { instanceId: released.data.instanceId } });
    const endAt = new Date(p.a.startAt.getTime() + 3600000).toISOString();
    await masters.publishRosterIntervals(alpha.users.planner.principal, {intervals:[{machineId:alpha.masters.machineId,facilityId:alpha.users.planner.principal.facilityId!,intervalType:'SHIFT',startAt:p.a.startAt.toISOString(),endAt:p.a.endAt.toISOString()}]},key());
    await new PlanningService(fixture.db).assignTask(alpha.users.planner.principal, { taskId: task.id, expectedVersion: task.version, technicianId: alpha.masters.technicianId, machineId: alpha.masters.machineId, startAt: p.a.startAt.toISOString(), endAt }, key());
    return { ...p, taskId: task.id };
  }
  it('requires authenticated manager authority at the route and command boundaries', async () => {
    expect((await POST(new NextRequest('http://localhost/api/roster/shift-swaps', { method: 'POST', body: '{}' }))).status).toBe(401);
    await expect(swaps.request(fixture.alpha.users.operator.principal, {}, key())).rejects.toThrow(/Permission/);
  });
  it('saves pending requests without moving shifts, then swaps both sides once with audit and idempotency', async () => {
    const p = await pair(); const attempt = key(); const requested = await swaps.request(fixture.alpha.users.planner.principal, input(p), attempt);
    expect((await swaps.request(fixture.alpha.users.planner.principal, input(p), attempt)).meta.replayed).toBe(true);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.a.id } })).technicianId).toBe(p.a.technicianId);
    const decisionKey = key(); const approved = await swaps.decide(fixture.alpha.users.planner.principal, requested.data.id, { decision: 'APPROVE', expectedVersion: 1 }, decisionKey);
    expect(approved.data.status).toBe('APPROVED'); expect(approved.data.movedTasks).toBe(0);
    await fixture.db.membership.update({ where: { id: fixture.alpha.users.planner.principal.membershipId }, data: { status: 'DISABLED' } });
    await expect(swaps.decide(fixture.alpha.users.planner.principal, requested.data.id, { decision: 'APPROVE', expectedVersion: 1 }, decisionKey)).rejects.toThrow(/no longer active/i);
    await fixture.db.membership.update({ where: { id: fixture.alpha.users.planner.principal.membershipId }, data: { status: 'ACTIVE' } });
    expect((await swaps.decide(fixture.alpha.users.planner.principal, requested.data.id, { decision: 'APPROVE', expectedVersion: 1 }, decisionKey)).meta.replayed).toBe(true);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.a.id } })).technicianId).toBe(techB);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.b.id } })).technicianId).toBe(p.a.technicianId);
    expect((await swaps.list(fixture.alpha.users.planner.principal, techB)).requests.some(r => r.id === requested.data.id)).toBe(true);
    expect(await fixture.db.auditEvent.count({ where: { aggregateId: requested.data.id } })).toBe(2);
  });
  it('rejects stale versions, cross-workspace targets, duplicate pending shifts and live facility revocation', async () => {
    const p = await pair(); const planner = fixture.alpha.users.planner.principal;
    await expect(swaps.request(planner, { ...input(p), sourceVersion: 99 }, key())).rejects.toThrow(/changed/);
    await expect(swaps.request(fixture.beta.users.owner.principal, input(p), key())).rejects.toThrow(/not found/);
    const request = await swaps.request(planner, input(p), key());
    await expect(swaps.request(planner, input(p), key())).rejects.toThrow(/pending/);
    expect((await swaps.list(planner, p.a.technicianId!, p.a.id)).candidates.some(candidate => candidate.id === p.b.id)).toBe(false);
    await fixture.db.rosterInterval.update({ where: { id: p.a.id }, data: { notes: 'Edited after review', version: { increment: 1 } } });
    await expect(swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())).rejects.toThrow(/evidence changed/);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.b.id } })).technicianId).toBe(techB);
    await swaps.decide(planner, request.data.id, { decision: 'REJECT', expectedVersion: 1, note: 'Stale request' }, key());
    expect((await fixture.db.shiftSwapRequest.findUniqueOrThrow({ where: { id: request.data.id } })).status).toBe('REJECTED');
  });
  it('blocks conflicting leave and excessive weekly hours without changing either shift', async () => {
    const p = await pair(); const planner = fixture.alpha.users.planner.principal;
    await masters.publishRosterIntervals(planner, { intervals: [{ technicianId: techB, facilityId: planner.facilityId!, intervalType: 'LEAVE', startAt: p.a.startAt.toISOString(), endAt: p.a.endAt.toISOString() }] }, key());
    await expect(swaps.request(planner, input(p), key())).rejects.toThrow(/leave or training/);
    const q = await pair();
    await fixture.db.technician.update({ where: { id: techB }, data: { maxWeeklyMinutes: 60 } });
    const requested = await swaps.request(planner, input(q), key());
    await expect(swaps.decide(planner, requested.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())).rejects.toThrow(/weekly working limit/);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: q.a.id } })).technicianId).toBe(q.a.technicianId);
    await fixture.db.technician.update({ where: { id: techB }, data: { maxWeeklyMinutes: 2400 } });
  });
  it('rolls back booked swaps for missing or expired skills, then transfers the real booking and task when qualified', async () => {
    const p = await bookedPair(); const planner = fixture.alpha.users.planner.principal; const request = await swaps.request(planner, input(p), key());
    const original = await fixture.db.task.findUniqueOrThrow({ where: { id: p.taskId } });
    await expect(swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())).rejects.toThrow(/skill/);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.a.id } })).technicianId).toBe(p.a.technicianId);
    expect((await fixture.db.task.findUniqueOrThrow({ where: { id: p.taskId } })).version).toBe(original.version);
    expect(await fixture.db.resourceBooking.count({ where: { taskId: p.taskId, resourceId: p.a.technicianId!, status: 'CONFIRMED' } })).toBe(1);
    await masters.assignSkill(planner, techB, { skillId: fixture.alpha.masters.skillId, level: 4, expiresAt: new Date(p.a.startAt.getTime() + 1800000).toISOString() }, key());
    await expect(swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())).rejects.toThrow(/expires/);
    await masters.assignSkill(planner, techB, { skillId: fixture.alpha.masters.skillId, level: 4, expiresAt: new Date(p.a.endAt.getTime() + 86400000).toISOString() }, key());
    const approved = await swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key());
    expect(approved.data.movedTasks).toBe(1);
    expect(await fixture.db.resourceBooking.count({where:{taskId:p.taskId,resourceType:'MACHINE',resourceId:fixture.alpha.masters.machineId,status:'CONFIRMED'}})).toBe(1);
    expect((await fixture.db.task.findUniqueOrThrow({ where: { id: p.taskId } })).assignedTechnicianId).toBe(techB);
    expect(await fixture.db.resourceBooking.count({ where: { taskId: p.taskId, resourceId: techB, status: 'CONFIRMED' } })).toBe(1);
    expect(await fixture.db.resourceBooking.count({ where: { taskId: p.taskId, resourceId: p.a.technicianId!, status: 'CONFIRMED' } })).toBe(0);
    expect(await fixture.db.workflowEvent.count({ where: { taskId: p.taskId, action: 'SHIFT_SWAP_ASSIGN' } })).toBe(1);
  });
  it('rolls back both roster writes when a later command write fails and allows a safe retry', async () => {
    const p = await pair(); const planner = fixture.alpha.users.planner.principal; const request = await swaps.request(planner, input(p), key());
    // A database trigger fails only after both roster updates, at the decision write.
    await fixture.db.$executeRawUnsafe(`CREATE TRIGGER fail_swap_decision BEFORE UPDATE ON shift_swap_requests WHEN NEW.status='APPROVED' BEGIN SELECT RAISE(ABORT,'injected swap failure'); END;`);
    await expect(swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())).rejects.toThrow();
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.a.id } })).technicianId).toBe(p.a.technicianId);
    expect((await fixture.db.rosterInterval.findUniqueOrThrow({ where: { id: p.b.id } })).technicianId).toBe(p.b.technicianId);
    expect((await fixture.db.shiftSwapRequest.findUniqueOrThrow({ where: { id: request.data.id } })).status).toBe('PENDING');
    await fixture.db.$executeRawUnsafe('DROP TRIGGER fail_swap_decision');
    const outcomes = await Promise.allSettled([swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key()), swaps.decide(planner, request.data.id, { decision: 'APPROVE', expectedVersion: 1 }, key())]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
  });
});
