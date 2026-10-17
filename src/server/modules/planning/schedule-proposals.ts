import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { scheduleFiniteCapacity, FiniteCapacityTaskInput } from '@/engines/schedule';
import { ScheduleProposalRequestSchema, ApplyScheduleProposalSchema, ApplyScheduleProposalInput } from './contracts';
import { AvailabilityService } from './availability';
import { executeCommand } from '@/server/db/transaction';
import { PlanningService } from './service';

interface AppliedScheduleProposalDTO {
  state: 'APPLIED';
  orderId: string;
  instanceId: string;
  appliedTaskIds: string[];
}

const RequirementsSchema = z.object({
  machineClassId: z.string().optional(),
  requiredSkills: z.array(z.object({ skillId: z.string(), minLevel: z.number().int().min(0) })).default([]),
  requiredCertIds: z.array(z.string()).default([]),
});

function parseRequirements(value: string) {
  try {
    return RequirementsSchema.safeParse(JSON.parse(value));
  } catch {
    return { success: false as const, error: new Error('Invalid requirements JSON') };
  }
}

export class ScheduleProposalService {
  constructor(private readonly db: PrismaClient) {}

  /** Apply only the exact finite-capacity proposal the user reviewed. */
  async applyReviewedProposal(principal: Principal, rawInput: unknown, idempotencyKey: string) {
    requireAnyPermission(principal, ['planning.write', 'task.assign']);
    const input = ApplyScheduleProposalSchema.parse(rawInput);
    const existingReceipt = await this.db.commandReceipt.findUnique({
      where: { workspaceId_principalId_key: { workspaceId: principal.workspaceId, principalId: principal.userId, key: idempotencyKey } },
      select: { commandType: true },
    });
    if (existingReceipt) {
      if (existingReceipt.commandType !== 'planning.schedule-proposal.apply') {
        throw new ConflictError(`Idempotency key '${idempotencyKey}' was already used for another command.`, 'DUPLICATE_KEY_PAYLOAD', false);
      }
      return executeCommand<ApplyScheduleProposalInput, AppliedScheduleProposalDTO>({
        principal,
        commandType: 'planning.schedule-proposal.apply',
        idempotencyKey,
        payload: input,
        prismaClient: this.db,
        handler: async () => { throw new ConflictError('The idempotency receipt disappeared before replay.', 'DUPLICATE_KEY_PAYLOAD', false); },
      });
    }
    const current = await this.propose(principal, {
      orderId: input.orderId,
      instanceId: input.instanceId,
      startHorizon: input.startHorizon,
      horizonDays: input.horizonDays,
    });
    if (current.state !== 'COMPLETE' || !current.tasks.length) {
      throw new ConflictError(`The current schedule is no longer complete: ${current.tasks.flatMap((task) => task.reasons).join('; ') || current.state}. Generate and review a fresh proposal.`, 'STALE_SCHEDULE', true);
    }
    if (
      current.scope.orderVersion !== input.expected.orderVersion ||
      current.scope.workflowVersionId !== input.expected.workflowVersionId ||
      current.scope.engineeringRevisionId !== input.expected.engineeringRevisionId
    ) {
      throw new ConflictError('The order, workflow or engineering revision changed after review. Generate a fresh schedule proposal.', 'STALE_VERSION', true);
    }
    const byId = new Map(input.expected.tasks.map((task) => [task.taskId, task]));
    if (byId.size !== current.tasks.length || current.tasks.some((task) => !byId.has(task.taskId))) {
      throw new ConflictError('The active task set changed after review. Generate and review a fresh schedule proposal.', 'STALE_SCHEDULE', true);
    }
    if (current.tasks.some((task) => byId.get(task.taskId)!.version !== task.version)) {
      throw new ConflictError('One or more task versions changed after review. Generate a fresh schedule proposal.', 'STALE_VERSION', true);
    }
    if (current.tasks.some((task) => {
      const expected = byId.get(task.taskId)!;
      return expected.status !== task.status || expected.startAt !== task.startAt || expected.endAt !== task.endAt ||
        expected.technicianId !== task.technicianId || expected.machineId !== task.machineId;
    })) {
      throw new ConflictError('The schedule or resource assignments changed after review. Generate and review a fresh proposal.', 'STALE_SCHEDULE', true);
    }
    const planning = new PlanningService(this.db);
    return executeCommand<ApplyScheduleProposalInput, AppliedScheduleProposalDTO>({
      principal,
      commandType: 'planning.schedule-proposal.apply',
      idempotencyKey,
      payload: input,
      prismaClient: this.db,
      handler: async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.findFirst({
          where: { workspaceId: principal.workspaceId, id: input.orderId },
          select: { id: true, status: true, facilityId: true, version: true },
        });
        if (!order || !['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(order.status)) {
          throw new NotFoundError(`Active released order '${input.orderId}' not found`);
        }
        const grantedFacilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
        if (order.facilityId && !grantedFacilityIds.includes(order.facilityId)) throw new NotFoundError(`Active released order '${input.orderId}' not found`);
        if (order.version !== input.expected.orderVersion) throw new ConflictError('The order changed after review. Generate a fresh schedule proposal.', 'STALE_VERSION', true);
        const instance = await tx.workflowInstance.findFirst({
          where: { workspaceId: principal.workspaceId, id: input.instanceId, orderId: order.id, status: 'ACTIVE' },
          select: { id: true, workflowVersionId: true, engineeringRevisionId: true },
        });
        if (!instance || instance.workflowVersionId !== input.expected.workflowVersionId || instance.engineeringRevisionId !== input.expected.engineeringRevisionId) {
          throw new ConflictError('The active job, workflow, or engineering revision changed after review.', 'STALE_VERSION', true);
        }

        const taskIds = current.tasks.map(({ taskId }) => taskId);
        const openTasks = await tx.task.findMany({
          where: { workspaceId: principal.workspaceId, instanceId: input.instanceId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: { id: true },
        });
        if (openTasks.length !== taskIds.length || openTasks.some(({ id }) => !taskIds.includes(id))) {
          throw new ConflictError('The active job task set changed after review.', 'STALE_SCHEDULE', true);
        }
        const currentTasks = await tx.task.findMany({
          where: { workspaceId: principal.workspaceId, instanceId: input.instanceId, id: { in: taskIds } },
          include: { predecessorDeps: { include: { predecessor: { select: { id: true, status: true } } } }, demands: { include: { reservations: true } } },
        });
        if (currentTasks.length !== current.tasks.length) throw new ConflictError('The open task set changed during schedule application.', 'STALE_SCHEDULE', true);
        const currentById = new Map(currentTasks.map((task) => [task.id, task]));
        const reviewedById = new Map(input.expected.tasks.map((task) => [task.taskId, task]));
        for (const task of currentTasks) {
          const reviewed = reviewedById.get(task.id)!;
          if (task.version !== reviewed.version || !['PENDING', 'READY'].includes(task.status)) {
            throw new ConflictError(`Task ${task.nodeKey} is no longer eligible for the reviewed schedule.`, 'STALE_VERSION', true);
          }
          for (const dependency of task.predecessorDeps) {
            if (dependency.predecessor.status === 'COMPLETED') continue;
            const predecessor = reviewedById.get(dependency.predecessor.id);
            if (!predecessor || new Date(predecessor.endAt).getTime() > new Date(reviewed.startAt).getTime()) {
              throw new ConflictError(`Task ${task.nodeKey} no longer follows its predecessor dependencies.`, 'STALE_SCHEDULE', true);
            }
          }
          for (const demand of task.demands) {
            if (demand.status === 'ISSUED') continue;
            const reservedAtoms = demand.reservations.filter((reservation) => reservation.status === 'ACTIVE').reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
            if (reservedAtoms < demand.requiredAtoms) throw new ConflictError(`Material demand for task ${task.nodeKey} is no longer fully reserved or issued.`, 'MATERIAL_NOT_READY', true);
          }
        }

        const appliedTaskIds: string[] = [];
        for (const reviewed of input.expected.tasks) {
          const task = current.tasks.find((candidate) => candidate.taskId === reviewed.taskId)!;
          const currentTask = currentById.get(task.taskId)!;
          if (new Date(reviewed.startAt).getTime() <= Date.now()) {
            throw new ConflictError(`The reviewed time window for ${task.nodeKey} has started. Generate a fresh proposal.`, 'STALE_SCHEDULE', true);
          }
          const evaluated = await planning.evaluateAssignmentInTransaction(tx, principal, {
            taskId: task.taskId,
            technicianId: reviewed.technicianId,
            machineId: reviewed.machineId,
            scheduledStartAt: reviewed.startAt,
            scheduledEndAt: reviewed.endAt,
          });
          if (!evaluated.isEligible) throw new ConflictError(`Assignment for ${task.nodeKey} is no longer eligible: ${evaluated.violations.join('; ')}`, 'STALE_CAPACITY', true);
          const updated = await tx.task.updateMany({
            where: { workspaceId: principal.workspaceId, id: task.taskId, instanceId: input.instanceId, version: reviewed.version, status: { in: ['PENDING', 'READY'] } },
            data: { assignedTechnicianId: reviewed.technicianId, assignedMachineId: reviewed.machineId, status: 'ASSIGNED', version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ConflictError(`Task ${task.nodeKey} changed during proposal application.`, 'STALE_VERSION', true);
          await planning.replaceBookingsInTransaction(tx, principal.workspaceId, task.taskId, [
            ...(reviewed.technicianId ? [{ resourceType: 'TECHNICIAN' as const, resourceId: reviewed.technicianId, startAt: new Date(reviewed.startAt), endAt: new Date(reviewed.endAt) }] : []),
            ...(reviewed.machineId ? [{ resourceType: 'MACHINE' as const, resourceId: reviewed.machineId, startAt: new Date(reviewed.startAt), endAt: new Date(reviewed.endAt) }] : []),
          ]);
          await tx.workflowEvent.create({ data: {
            workspaceId: principal.workspaceId,
            instanceId: currentTask.instanceId,
            taskId: task.taskId,
            fromStatus: currentTask.status,
            toStatus: 'ASSIGNED',
            action: 'SCHEDULE_PROPOSAL_APPLY',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({ orderId: input.orderId, startAt: reviewed.startAt, endAt: reviewed.endAt, technicianId: reviewed.technicianId, machineId: reviewed.machineId }),
          } });
          appliedTaskIds.push(task.taskId);
        }
        return {
          data: { state: 'APPLIED' as const, orderId: input.orderId, instanceId: input.instanceId, appliedTaskIds },
          aggregateType: 'WORKFLOW_INSTANCE',
          aggregateId: input.instanceId,
          resourceVersion: current.tasks.reduce((max, task) => Math.max(max, task.version), 0) + 1,
          auditDetails: { appliedTaskCount: appliedTaskIds.length, taskIds: appliedTaskIds, scheduleOrderVersion: input.expected.orderVersion },
        };
      },
    });
  }

  async propose(principal: Principal, rawInput: unknown) {
    requireAnyPermission(principal, ['planning.read', 'planning.write', 'task.assign']);
    const input = ScheduleProposalRequestSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;
    const requestedHorizon = new Date(input.startHorizon);
    const now = Date.now();
    if (requestedHorizon.getTime() < now - 5 * 60_000) throw new BadRequestError('Schedule proposal horizon cannot start in the past.');
    const horizonStart = new Date(Math.max(requestedHorizon.getTime(), now));
    const horizonEnd = new Date(horizonStart.getTime() + input.horizonDays * 86_400_000);

    const order = await this.db.order.findUnique({
      where: { workspaceId_id: { workspaceId, id: input.orderId } },
      select: { id: true, orderNumber: true, facilityId: true, version: true, facility: { select: { timezone: true } } },
    });
    if (!order) throw new NotFoundError(`Order '${input.orderId}' not found`);
    const grantedFacilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
    if (order.facilityId && !grantedFacilityIds.includes(order.facilityId)) {
      throw new NotFoundError(`Order '${input.orderId}' not found`);
    }

    const instances = await this.db.workflowInstance.findMany({
      where: {
        workspaceId,
        orderId: order.id,
        status: 'ACTIVE',
        ...(input.instanceId ? { id: input.instanceId } : {}),
      },
      include: {
        workflowVersion: { include: { nodes: true } },
        engineeringRevision: {
          include: {
            bomLines: {
              include: { demands: { include: { reservations: true } } },
            },
          },
        },
        tasks: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          include: { predecessorDeps: { include: { predecessor: { select: { status: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (input.instanceId && instances.length !== 1) throw new NotFoundError(`Active workflow instance '${input.instanceId}' not found for this order`);
    if (instances.length === 0) throw new NotFoundError(`No active workflow instance found for order '${order.orderNumber}'`);
    if (instances.length > 1) throw new BadRequestError('This order has multiple active jobs. Select one workflow instance for the schedule proposal.');

    const instance = instances[0];
    if (instance.tasks.length > 50) throw new BadRequestError('A schedule proposal is limited to 50 open tasks per job.');

    const technicians = await this.db.technician.findMany({
      where: { workspaceId, isActive: true, archivedAt: null },
      include: { skills: { include: { skill: true } }, certifications: { include: { certification: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    });
    const machines = await this.db.machine.findMany({
      where: { workspaceId, archivedAt: null, status: { notIn: ['OFFLINE', 'MAINTENANCE'] } },
      include: { machineClass: true },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const facilityGrants = order.facilityId
      ? await this.db.membershipFacilityGrant.findMany({ where: { workspaceId, facilityId: order.facilityId } })
      : [];
    const grantedMembershipIds = new Set(facilityGrants.map((grant) => grant.membershipId));
    const taskRequirements = instance.tasks.map((task) => {
      const node = instance.workflowVersion.nodes.find((candidate) => candidate.key === task.nodeKey);
      return { task, parsed: node ? parseRequirements(node.requirementsJson) : null };
    });

    const allUsedTechnicianIds = new Set<string>();
    const allUsedMachineIds = new Set<string>();
    const engineTasks: FiniteCapacityTaskInput[] = taskRequirements.map(({ task, parsed }) => {
      const dependencies = task.predecessorDeps;
      const predecessorTaskIds = dependencies
        .filter((dependency) => !['COMPLETED', 'CANCELLED'].includes(dependency.predecessor.status))
        .map((dependency) => dependency.predecessorTaskId)
        .filter((id) => instance.tasks.some((candidate) => candidate.id === id));
      const preconditionReasons = [
        ...(!order.facilityId ? ['Order has no facility scope'] : []),
        ...(!['PENDING', 'READY'].includes(task.status) ? [`Task status ${task.status} is not eligible for a new schedule assignment`] : []),
        ...(dependencies.some((dependency) => dependency.predecessor.status === 'CANCELLED') ? ['A predecessor task was cancelled'] : []),
      ];
      if (!parsed?.success) {
        return {
          id: task.id,
          version: task.version,
          plannedDurationMinutes: task.plannedDurationMinutes,
          predecessorTaskIds,
          preconditionReasons: [...preconditionReasons, 'Workflow requirements are missing or invalid'],
          requiresTechnician: false,
          requiresMachine: false,
          materialReady: false,
        };
      }
      const requirements = parsed.data;
      const requiresTechnician = requirements.requiredSkills.length > 0 || requirements.requiredCertIds.length > 0;
      const requiresMachine = Boolean(requirements.machineClassId);
      const bomLines = instance.engineeringRevision.bomLines.filter((line) => line.operationNodeKey === task.nodeKey);
      const materialReady = bomLines.every((line) => line.demands.length > 0 && line.demands.every((demand) => {
        if (demand.status === 'ISSUED') return true;
        const reservedAtoms = demand.reservations
          .filter((reservation) => reservation.status === 'ACTIVE')
          .reduce((sum, reservation) => sum + reservation.reservedAtoms, 0n);
        return demand.status === 'ALLOCATED' && reservedAtoms >= demand.requiredAtoms;
      }));
      const eligibleTechnicianIds = technicians.filter((tech) => {
        if (order.facilityId && tech.facilityId && tech.facilityId !== order.facilityId && (!tech.membershipId || !grantedMembershipIds.has(tech.membershipId))) return false;
        return requirements.requiredSkills.every((required) => {
          const skill = tech.skills.find((candidate) => candidate.skillId === required.skillId || candidate.skill.code === required.skillId);
          return Boolean(skill && skill.assessmentStatus === 'VERIFIED' && !skill.revokedAt && skill.level >= required.minLevel && (!skill.validFrom || skill.validFrom <= horizonStart) && (!skill.expiresAt || skill.expiresAt >= horizonEnd));
        }) && requirements.requiredCertIds.every((requiredId) => {
          const cert = tech.certifications.find((candidate) => candidate.certificationId === requiredId || candidate.certification.code === requiredId);
          const expiresAt = cert?.expiresAtDate ?? (cert?.validUntil ? new Date(`${cert.validUntil}T23:59:59.999Z`) : null);
          return Boolean(cert && cert.status === 'ACTIVE' && !cert.revokedAt && (!cert.validFromDate || cert.validFromDate <= horizonStart) && (!expiresAt || expiresAt >= horizonEnd));
        });
      }).map((tech) => tech.id);
      const compatibleMachineIds = machines
        .filter((machine) => machine.machineClassId === requirements.machineClassId || machine.machineClass.code === requirements.machineClassId)
        .filter((machine) => !order.facilityId || !machine.facilityId || machine.facilityId === order.facilityId)
        .map((machine) => machine.id);
      if (requiresTechnician) eligibleTechnicianIds.forEach((id) => allUsedTechnicianIds.add(id));
      if (requiresMachine) compatibleMachineIds.forEach((id) => allUsedMachineIds.add(id));
      return {
        id: task.id,
        version: task.version,
        plannedDurationMinutes: task.plannedDurationMinutes,
        predecessorTaskIds,
        preconditionReasons,
        requiresTechnician,
        requiresMachine,
        eligibleTechnicianIds,
        compatibleMachineIds,
        materialReady,
      };
    });

    const availability = new AvailabilityService(this.db);
    const [technicianAvailabilityEntries, machineAvailabilityEntries] = await Promise.all([
      Promise.all([...allUsedTechnicianIds].map(async (id) => [id, await availability.getAvailableIntervals(principal, {
        resourceType: 'TECHNICIAN', resourceId: id, startAt: horizonStart, endAt: horizonEnd,
      })] as const)),
      Promise.all([...allUsedMachineIds].map(async (id) => [id, await availability.getAvailableIntervals(principal, {
        resourceType: 'MACHINE', resourceId: id, startAt: horizonStart, endAt: horizonEnd,
      })] as const)),
    ]);

    const result = scheduleFiniteCapacity({
      startHorizon: horizonStart,
      tasks: engineTasks,
      technicianAvailability: Object.fromEntries(technicianAvailabilityEntries),
      machineAvailability: Object.fromEntries(machineAvailabilityEntries),
    });
    const scheduledCount = result.tasks.filter((task) => task.status === 'SCHEDULED').length;
    const techniciansById = new Map(technicians.map((technician) => [technician.id, technician.name]));
    const machinesById = new Map(machines.map((machine) => [machine.id, machine.name]));
    return {
      ...result,
      tasks: result.tasks.map((taskResult) => ({
        ...taskResult,
        nodeKey: instance.tasks.find((task) => task.id === taskResult.taskId)?.nodeKey ?? taskResult.taskId,
        technicianName: taskResult.technicianId ? techniciansById.get(taskResult.technicianId) ?? null : null,
        machineName: taskResult.machineId ? machinesById.get(taskResult.machineId) ?? null : null,
      })),
      assumptions: [
        ...result.assumptions,
        'Verified qualifications must remain valid through the full planning horizon; certificates expiring earlier are conservatively excluded.',
        'Uses approved workflow planned duration as recorded; the preview does not scale duration by quantity or infer unrecorded changeovers.',
      ],
      state: result.tasks.length === 0 ? 'NO_OPEN_TASKS' : scheduledCount === result.tasks.length ? 'COMPLETE' : scheduledCount > 0 ? 'PARTIAL' : 'NO_FEASIBLE_TASKS',
      scope: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: order.version,
        facilityTimezone: order.facility?.timezone ?? null,
        instanceId: instance.id,
        workflowVersionId: instance.workflowVersionId,
        engineeringRevisionId: instance.engineeringRevisionId,
        facilityId: order.facilityId,
        horizonStart: horizonStart.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
}
