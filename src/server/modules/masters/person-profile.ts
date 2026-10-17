import type { PrismaClient } from '@prisma/client';
import type { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError } from '@/domain/errors';
import { NotFoundError, ForbiddenError } from '@/domain/errors';

export async function getTechnicianProfile(db: PrismaClient, principal: Principal, id: string, start: Date, end: Date) {
  requireAnyPermission(principal, ['access.manage', 'resource.manage', 'planning.read']);
  const technician = await db.technician.findFirst({ where: { id, workspaceId: principal.workspaceId }, include: { department: true, calendar: { include: { exceptions: { where: { date: { gte: start.toISOString().slice(0, 10), lte: end.toISOString().slice(0, 10) } }, orderBy: { date: 'asc' } } } }, skills: { include: { skill: true } }, certifications: { include: { certification: true } }, facility: true } });
  if (!technician) throw new NotFoundError('Technician not found');
  if (technician.facilityId && !principal.facilityIds?.includes(technician.facilityId)) throw new ForbiddenError('Technician is outside your granted facilities');
  const membership = technician.membershipId ? await db.membership.findFirst({ where: { id: technician.membershipId, workspaceId: principal.workspaceId }, select: { id: true, status: true, user: { select: { name: true, email: true } } } }) : null;
  const [roster, bookings, tasks] = await Promise.all([
    db.rosterInterval.findMany({ where: { workspaceId: principal.workspaceId, technicianId: id, startAt: { lt: end }, endAt: { gt: start } }, orderBy: { startAt: 'asc' }, take: 101 }),
    db.resourceBooking.findMany({ where: { workspaceId: principal.workspaceId, task: { instance: { order: { facilityId: { in: principal.facilityIds ?? [] } } } }, resourceType: 'TECHNICIAN', resourceId: id, startAt: { lt: end }, endAt: { gt: start }, status: 'CONFIRMED' }, include: { task: { include: { instance: { include: { order: { select: { orderNumber: true } } } } } } }, orderBy: { startAt: 'asc' }, take: 101 }),
    db.task.findMany({ where: { workspaceId: principal.workspaceId, instance: { order: { facilityId: { in: principal.facilityIds ?? [] } } }, assignedTechnicianId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, nodeKey: true, status: true, instance: { select: { order: { select: { orderNumber: true } }, workflowVersion: { select: { nodes: { select: { key: true, name: true } } } } } } }, orderBy: { createdAt: 'asc' }, take: 101 }),
  ]);
  return { technician, membership, range: { startAt: start.toISOString(), endAt: end.toISOString() }, roster: roster.slice(0, 100), bookings: bookings.slice(0, 100).map(b => ({ id: b.id, taskId: b.taskId, startAt: b.startAt, endAt: b.endAt, orderNumber: b.task.instance.order.orderNumber, operation: b.task.nodeKey })), tasks: tasks.slice(0, 100).map(t => ({ id: t.id, status: t.status, orderNumber: t.instance.order.orderNumber, operation: t.instance.workflowVersion.nodes.find(n => n.key === t.nodeKey)?.name ?? t.nodeKey })), truncated: roster.length > 100 || bookings.length > 100 || tasks.length > 100 };
}

export async function cancelPersonRoster(db: PrismaClient, principal: Principal, id: string, expectedVersion: number, idempotencyKey: string) {
  requireAnyPermission(principal, ['resource.manage', 'planning.write']);
  return executeCommand({ principal, commandType: 'roster.cancel', idempotencyKey, expectedVersion, payload: { id, expectedVersion }, prismaClient: db, handler: async tx => {
    const interval = await tx.rosterInterval.findFirst({ where: { id, workspaceId: principal.workspaceId }, include: { technician: true } });
    if (!interval || !interval.technician) throw new NotFoundError('Technician roster interval not found');
    const facilityId = interval.facilityId ?? interval.technician.facilityId;
    if (facilityId && !principal.facilityIds?.includes(facilityId)) throw new ForbiddenError('Roster is outside your granted facilities');
    if (interval.status !== 'PUBLISHED') throw new BadRequestError('Only published intervals can be cancelled');
    if (['SHIFT', 'OVERTIME'].includes(interval.intervalType) && await tx.resourceBooking.count({ where: { workspaceId: principal.workspaceId, resourceType: 'TECHNICIAN', resourceId: interval.technician.id, status: 'CONFIRMED', startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } } })) throw new BadRequestError('This interval has confirmed work bookings. Replan that work before removing availability.');
    const updated = await tx.rosterInterval.update({ where: { id }, data: { status: 'CANCELLED', version: { increment: 1 } } });
    return { data: updated, aggregateType: 'ROSTER_INTERVAL', aggregateId: id, previousVersion: interval.version, resourceVersion: updated.version };
  } });
}
