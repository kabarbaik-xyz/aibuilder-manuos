import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { executeCommand } from '@/server/db/transaction';
import { AvailabilityService } from '@/server/modules/planning/availability';
import { PlanningService } from '@/server/modules/planning/service';
import { NotificationService } from '@/server/modules/notifications/service';

export const RequestShiftSwapSchema = z.object({
  sourceRosterId: z.string().uuid(), targetRosterId: z.string().uuid(),
  sourceVersion: z.number().int().positive(), targetVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
}).strict();
export const DecideShiftSwapSchema = z.object({
  expectedVersion: z.number().int().positive(), decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).default(''),
}).strict().refine(input => input.decision !== 'REJECT' || input.note.length >= 3, { path: ['note'], message: 'Give a reason for rejection' });
type Tx = Prisma.TransactionClient;
const authority = (principal: Principal) => requireAnyPermission(principal, ['resource.manage', 'planning.write']);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const weekStart = (value: Date) => { const day = new Date(value); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7); return day; };

export class ShiftSwapService {
  constructor(private readonly db: PrismaClient) {}

  private async liveAuthority(tx: Tx, principal: Principal) {
    authority(principal);
    const member = await tx.membership.findFirst({ where: { id: principal.membershipId, userId: principal.userId, workspaceId: principal.workspaceId, status: 'ACTIVE', roles: { some: { role: { isActive: true, permissions: { some: { permissionCode: { in: ['resource.manage', 'planning.write'] } } } } } } }, include: { facilityGrants: true } });
    if (!member) throw new ForbiddenError('Roster management access is no longer active');
    return { ...principal, facilityIds: [...new Set([...(member.facilityId ? [member.facilityId] : []), ...member.facilityGrants.map(g => g.facilityId)])] };
  }

  private async snapshot(tx: Tx, principal: Principal, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestError('Choose two different shifts');
    const shifts = await tx.rosterInterval.findMany({ where: { workspaceId: principal.workspaceId, id: { in: [sourceId, targetId] } }, include: { technician: true } });
    const source = shifts.find(s => s.id === sourceId); const target = shifts.find(s => s.id === targetId);
    if (!source || !target) throw new NotFoundError('Shift not found in this workspace');
    for (const shift of [source, target]) {
      if (shift.status !== 'PUBLISHED' || shift.intervalType !== 'SHIFT' || shift.machineId || !shift.technician || !shift.technician.isActive || shift.technician.archivedAt) throw new BadRequestError('Only published shifts for active technicians can be swapped');
      if (shift.endAt.getTime() - shift.startAt.getTime() > 24 * 3600000 || shift.endAt <= shift.startAt) throw new BadRequestError('Swap shifts must have a positive duration of at most 24 hours');
      if (shift.startAt <= new Date()) throw new BadRequestError('Only future shifts can be swapped');
      for (const facility of [shift.facilityId, shift.technician.facilityId].filter(Boolean)) if (!principal.facilityIds?.includes(facility!)) throw new ForbiddenError('Shift is outside your granted facilities');
      if (shift.facilityId && shift.technician.facilityId && shift.facilityId !== shift.technician.facilityId) throw new BadRequestError('Shift and technician facilities must agree');
    }
    if (source.technicianId === target.technicianId) throw new BadRequestError('Choose shifts belonging to two different technicians');
    if ((source.facilityId ?? source.technician!.facilityId) !== (target.facilityId ?? target.technician!.facilityId)) throw new BadRequestError('Shift swaps must remain in one facility');
    const transfers = [];
    for (const [outgoing, incoming] of [[source, target], [target, source]]) {
      const conflict = await tx.rosterInterval.findFirst({ where: { workspaceId: principal.workspaceId, technicianId: incoming.technicianId, status: 'PUBLISHED', id: { notIn: [sourceId, targetId] }, startAt: { lt: outgoing.endAt }, endAt: { gt: outgoing.startAt } } });
      if (conflict) throw new BadRequestError(`${incoming.technician!.name} has another shift, leave or training in the incoming time slot`);
      const bookings = await tx.resourceBooking.findMany({ where: { workspaceId: principal.workspaceId, resourceType: 'TECHNICIAN', resourceId: outgoing.technicianId!, status: 'CONFIRMED', startAt: { lt: outgoing.endAt }, endAt: { gt: outgoing.startAt } }, include: { task: { include: { instance: { include: { order: true } } } } }, orderBy: { id: 'asc' } });
      for (const booking of bookings) {
        if (booking.startAt < outgoing.startAt || booking.endAt > outgoing.endAt) throw new BadRequestError('A booking crosses the shift boundary; replan the full task before swapping');
        if (booking.task.assignedTechnicianId !== outgoing.technicianId || !['PENDING', 'READY', 'ASSIGNED'].includes(booking.task.status)) throw new BadRequestError('Only unstarted, consistently assigned tasks may move with a shift');
        if (!booking.task.instance.order.facilityId || !principal.facilityIds?.includes(booking.task.instance.order.facilityId)) throw new ForbiddenError('A task is outside your granted facility scope');
        transfers.push({ bookingId: booking.id, bookingVersion: booking.version, taskId: booking.taskId, taskVersion: booking.task.version, instanceId: booking.task.instanceId, taskStatus: booking.task.status, orderVersion: booking.task.instance.order.version, orderNumber: booking.task.instance.order.orderNumber, operation: booking.task.nodeKey, outgoingId: outgoing.technicianId!, incomingId: incoming.technicianId!, startAt: booking.startAt.toISOString(), endAt: booking.endAt.toISOString(), machineId: booking.task.assignedMachineId });
      }
    }
    for (const [outgoing, incoming] of [[source, target], [target, source]]) {
      const conflict = await tx.resourceBooking.findFirst({ where: { workspaceId: principal.workspaceId, resourceType: 'TECHNICIAN', resourceId: incoming.technicianId!, status: 'CONFIRMED', id: { notIn: transfers.map(t => t.bookingId) }, startAt: { lt: outgoing.endAt }, endAt: { gt: outgoing.startAt } } });
      if (conflict) throw new BadRequestError(`${incoming.technician!.name} already has assigned work in the incoming time slot`);
    }
    if (new Set(transfers.map(t => t.taskId)).size !== transfers.length) throw new BadRequestError('Each task must have exactly one technician booking to swap');
    const slots = [source, target].map(s => ({ id: s.id, version: s.version, technicianId: s.technicianId!, technicianVersion: s.technician!.version, technicianName: s.technician!.name, facilityId: s.facilityId ?? s.technician!.facilityId, startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString(), breaks: s.breakIntervalsJson, maxWeeklyMinutes: s.technician!.maxWeeklyMinutes }));
    return { slots, transfers };
  }

  async request(principal: Principal, raw: unknown, key: string) {
    authority(principal); const input = RequestShiftSwapSchema.parse(raw);
    return executeCommand({ principal, commandType: 'roster.swap.request', idempotencyKey: key, payload: input, prismaClient: this.db, handler: async (tx: Tx) => {
      const live = await this.liveAuthority(tx, principal); const snapshot = await this.snapshot(tx, live, input.sourceRosterId, input.targetRosterId);
      if (snapshot.slots[0].version !== input.sourceVersion || snapshot.slots[1].version !== input.targetVersion) throw new ConflictError('A selected shift changed; reload before requesting a swap', 'STALE_VERSION');
      if (await tx.shiftSwapRequest.findFirst({ where: { workspaceId: principal.workspaceId, status: 'PENDING', OR: [{ sourceRosterId: { in: [input.sourceRosterId, input.targetRosterId] } }, { targetRosterId: { in: [input.sourceRosterId, input.targetRosterId] } }] } })) throw new ConflictError('One of these shifts already has a pending swap');
      const request = await tx.shiftSwapRequest.create({ data: { workspaceId: principal.workspaceId, sourceRosterId: input.sourceRosterId, targetRosterId: input.targetRosterId, sourceTechnicianId: snapshot.slots[0].technicianId, targetTechnicianId: snapshot.slots[1].technicianId, reason: input.reason, requestedById: principal.userId, snapshotJson: JSON.stringify(snapshot), snapshotHash: digest(snapshot) } });
      return { data: { id: request.id, status: request.status, version: request.version }, aggregateType: 'SHIFT_SWAP', aggregateId: request.id, resourceVersion: request.version };
    } });
  }

  async decide(principal: Principal, id: string, raw: unknown, key: string) {
    authority(principal); const input = DecideShiftSwapSchema.parse(raw);
    return executeCommand({ principal, commandType: 'roster.swap.decide', idempotencyKey: key, payload: { id, ...input }, prismaClient: this.db, handler: async (tx: Tx) => {
      const live = await this.liveAuthority(tx, principal);
      const request = await tx.shiftSwapRequest.findFirst({ where: { id, workspaceId: principal.workspaceId } });
      if (!request) throw new NotFoundError('Shift swap not found');
      if (request.version !== input.expectedVersion || request.status !== 'PENDING') throw new ConflictError('This request was already decided or changed', 'STALE_VERSION');
      const reviewed = JSON.parse(request.snapshotJson) as Awaited<ReturnType<ShiftSwapService['snapshot']>>;
      for (const slot of reviewed.slots) if (slot.facilityId && !live.facilityIds.includes(slot.facilityId)) throw new ForbiddenError('Shift swap is outside your granted facilities');
      let movedTasks = 0;
      if (input.decision === 'APPROVE') {
        const current = await this.snapshot(tx, live, request.sourceRosterId, request.targetRosterId);
        if (digest(current) !== request.snapshotHash) throw new ConflictError('Shift or work evidence changed. Reject this request and create a fresh one.', 'STALE_VERSION');
        // Remove both outgoing technician reservations before testing incoming allocations.
        // Machine reservations and physical inventory are never moved by a roster swap.
        await tx.resourceBooking.updateMany({ where: { id: { in: current.transfers.map(t => t.bookingId) }, workspaceId: principal.workspaceId, status: 'CONFIRMED' }, data: { status: 'CANCELLED', version: { increment: 1 } } });
        for (const [i, slot] of current.slots.entries()) {
          const changed = await tx.rosterInterval.updateMany({ where: { id: slot.id, workspaceId: principal.workspaceId, version: slot.version, technicianId: slot.technicianId }, data: { technicianId: current.slots[1 - i].technicianId, version: { increment: 1 } } });
          if (changed.count !== 1) throw new ConflictError('Shift changed during approval', 'STALE_VERSION');
        }
        // Check gross published working hours conservatively using the existing UTC work-week basis.
        for (const [i, incoming] of current.slots.entries()) {
          const slot = current.slots[1 - i]; const first = weekStart(new Date(slot.startAt)); const last = new Date(slot.endAt);
          for (let week = first; week < last; week = new Date(week.getTime() + 7 * 86400000)) {
            const until = new Date(week.getTime() + 7 * 86400000);
            const shifts = await tx.rosterInterval.findMany({ where: { workspaceId: principal.workspaceId, technicianId: incoming.technicianId, status: 'PUBLISHED', intervalType: { in: ['SHIFT', 'OVERTIME'] }, startAt: { lt: until }, endAt: { gt: week } } });
            const duration = shifts.reduce((sum, s) => sum + BigInt(Math.max(0, Math.min(s.endAt.getTime(), until.getTime()) - Math.max(s.startAt.getTime(), week.getTime()))), 0n);
            if (duration > BigInt(incoming.maxWeeklyMinutes) * 60000n) throw new BadRequestError(`${incoming.technicianName} would exceed the configured weekly working limit`);
          }
        }
        const planning = new PlanningService(this.db);
        for (const transfer of current.transfers) {
          const evaluation = await planning.evaluateAssignmentInTransaction(tx, live, { taskId: transfer.taskId, technicianId: transfer.incomingId, machineId: transfer.machineId, scheduledStartAt: transfer.startAt, scheduledEndAt: transfer.endAt });
          if (!evaluation.isEligible) throw new BadRequestError(`Cannot transfer ${transfer.orderNumber} / ${transfer.operation}: ${evaluation.violations.join('; ')}`);
          const task = await tx.task.findUniqueOrThrow({ where: { id: transfer.taskId }, include: { instance: { include: { order: true, workflowVersion: { include: { nodes: true } } } } } });
          const node = task.instance.workflowVersion.nodes.find(n => n.key === task.nodeKey);
          let requirements: { requiredSkills?: Array<{skillId:string;minLevel:number}>; requiredCertIds?: string[] };
          try { requirements = z.object({ requiredSkills: z.array(z.object({skillId:z.string(),minLevel:z.number().int().min(0)})).optional(), requiredCertIds:z.array(z.string()).optional() }).passthrough().parse(JSON.parse(node?.requirementsJson ?? '{}')); }
          catch { throw new BadRequestError('Task qualification requirements cannot be verified'); }
          const skills = await tx.skill.findMany({where:{workspaceId:principal.workspaceId,OR:[{id:{in:(requirements.requiredSkills??[]).map(r=>r.skillId)}},{code:{in:(requirements.requiredSkills??[]).map(r=>r.skillId)}}]}});
          const certs = await tx.certification.findMany({where:{workspaceId:principal.workspaceId,OR:[{id:{in:requirements.requiredCertIds??[]}},{code:{in:requirements.requiredCertIds??[]}},{name:{in:requirements.requiredCertIds??[]}}]}});
          const qualified = await new AvailabilityService(tx).verifyTechnicianEligibility(live, { technicianId:transfer.incomingId, slotStart:new Date(transfer.startAt), slotEnd:new Date(transfer.endAt), requiredFacilityId:task.instance.order.facilityId ?? undefined, minSkillLevels:(requirements.requiredSkills??[]).map(r=>({skillId:skills.find(s=>s.id===r.skillId||s.code===r.skillId)?.id??r.skillId,minLevel:r.minLevel})), requiredCertifications:(requirements.requiredCertIds??[]).map(ref=>({certificationId:certs.find(c=>c.id===ref||c.code===ref||c.name===ref)?.id??ref})) });
          if(!qualified.eligible) throw new BadRequestError(`Cannot transfer ${transfer.orderNumber} / ${transfer.operation}: ${qualified.violations.join('; ')}`);

          const changed = await tx.task.updateMany({ where: { id: task.id, workspaceId: principal.workspaceId, version: transfer.taskVersion, assignedTechnicianId: transfer.outgoingId }, data: { assignedTechnicianId: transfer.incomingId, version: { increment: 1 } } });
          if (changed.count !== 1) throw new ConflictError('Task assignment changed during approval', 'STALE_VERSION');
          await tx.resourceBooking.create({ data: { workspaceId: principal.workspaceId, taskId: task.id, resourceType: 'TECHNICIAN', resourceId: transfer.incomingId, startAt: new Date(transfer.startAt), endAt: new Date(transfer.endAt) } });
          await tx.workflowEvent.create({ data: { workspaceId: principal.workspaceId, instanceId: task.instanceId, taskId: task.id, fromStatus: task.status, toStatus: task.status, action: 'SHIFT_SWAP_ASSIGN', actorUserId: principal.userId, reason: request.reason, detailJson: JSON.stringify({ shiftSwapId: id, fromTechnicianId: transfer.outgoingId, toTechnicianId: transfer.incomingId }) } });
          movedTasks++;
        }
        for (const [slotIndex, slot] of current.slots.entries()) {
          const incomingSlot = current.slots[1-slotIndex];
          const tech = await tx.technician.findUniqueOrThrow({ where: { id: slot.technicianId } });
          const member = tech.membershipId ? await tx.membership.findFirst({ where: { id: tech.membershipId, workspaceId: principal.workspaceId, status: 'ACTIVE' } }) : null;
          if (member) await new NotificationService(tx).sendNotification(principal.workspaceId, { userId: member.userId, title: 'Shift swap approved', body: `Your shift is now ${incomingSlot.startAt} to ${incomingSlot.endAt} (UTC). Scheduled work in that shift is assigned to you. Review My Work.`, category: 'ASSIGNMENT', facilityId: slot.facilityId ?? undefined, dedupeKey: `shift-swap:${id}:${member.userId}`, subjectType: 'TECHNICIAN', subjectId: tech.id });
        }
      }
      const decisionUpdate = await tx.shiftSwapRequest.updateMany({ where: { id, workspaceId: principal.workspaceId, version: input.expectedVersion, status: 'PENDING' }, data: { status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedById: principal.userId, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
      if (decisionUpdate.count !== 1) throw new ConflictError('Request changed during decision', 'STALE_VERSION');
      const result = await tx.shiftSwapRequest.findUniqueOrThrow({ where: { id } });
      return { data: { id: result.id, status: result.status, version: result.version, movedTasks }, aggregateType: 'SHIFT_SWAP', aggregateId: id, previousVersion: request.version, resourceVersion: result.version, auditDetails: { decision: input.decision, movedTasks, sourceRosterId: request.sourceRosterId, targetRosterId: request.targetRosterId } };
    } });
  }

  async list(principal: Principal, technicianId: string, sourceId?: string) {
    authority(principal); const live = await this.liveAuthority(this.db as unknown as Tx, principal);
    const tech = await this.db.technician.findFirst({ where: { id: technicianId, workspaceId: principal.workspaceId } });
    if (!tech) throw new NotFoundError('Technician not found');
    if (tech.facilityId && !live.facilityIds.includes(tech.facilityId)) throw new ForbiddenError('Technician is outside your granted facilities');
    const requests = await this.db.shiftSwapRequest.findMany({ where: { workspaceId: principal.workspaceId, OR: [{ sourceTechnicianId: technicianId }, { targetTechnicianId: technicianId }] }, orderBy: { createdAt: 'desc' }, take: 51 });
    const visible = requests.filter(r => { const snapshot = JSON.parse(r.snapshotJson) as { slots: Array<{ facilityId: string | null }> }; return snapshot.slots.every(s => !s.facilityId || live.facilityIds.includes(s.facilityId)); });
    let candidates: Array<{ id: string; version: number; technicianId: string; technicianName: string; startAt: string; endAt: string }> = [];
    if (sourceId) {
      const source = await this.db.rosterInterval.findFirst({ where: { id: sourceId, workspaceId: principal.workspaceId, technicianId } });
      if (!source || source.intervalType !== 'SHIFT' || source.status !== 'PUBLISHED') throw new BadRequestError('Select a published technician shift');
      const facilityId = source.facilityId ?? tech.facilityId;
      if (facilityId && !live.facilityIds.includes(facilityId)) throw new ForbiddenError('Shift is outside your granted facilities');
      const rows = await this.db.rosterInterval.findMany({ where: { workspaceId: principal.workspaceId, intervalType: 'SHIFT', status: 'PUBLISHED', machineId: null, ...(facilityId ? { OR: [{ facilityId }, { facilityId: null, technician: { facilityId } }] } : { facilityId: null, AND: [{ technician: { facilityId: null } }] }), technicianId: { not: technicianId }, technician: { isActive: true, archivedAt: null }, startAt: { gt: new Date(), gte: new Date(source.startAt.getTime() - 31 * 86400000), lte: new Date(source.startAt.getTime() + 31 * 86400000) } }, include: { technician: true }, orderBy: { startAt: 'asc' }, take: 201 });
      candidates = rows.filter(r => (r.facilityId ?? r.technician?.facilityId) === facilityId && (!r.technician?.facilityId || live.facilityIds.includes(r.technician.facilityId))).slice(0, 200).map(r => ({ id: r.id, version: r.version, technicianId: r.technicianId!, technicianName: r.technician!.name, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString() }));
    }
    return { requests: visible.slice(0, 50).map(r => ({ id: r.id, status: r.status, reason: r.reason, decisionNote: r.decisionNote, version: r.version, createdAt: r.createdAt.toISOString(), snapshot: JSON.parse(r.snapshotJson) as { slots: Array<{ technicianName: string; startAt: string; endAt: string }>; transfers: Array<{ orderNumber: string; operation: string }> } })), candidates, truncated: requests.length > 50 };
  }
}
