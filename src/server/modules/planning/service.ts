import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { PlanningRepository } from './repository';
import {
  ScheduleTasksRequest,
  ScheduleTasksRequestSchema,
  EvaluateAssignmentInput,
  EvaluateAssignmentSchema,
  AssignTaskInput,
  AssignTaskSchema,
  AssignmentEvaluationResult,
  TaskPlanningDTO,
} from './contracts';
import {
  scheduleTasks as runScheduleEngine,
  addWorkingMinutes,
  DEFAULT_SCHEDULE_CALENDAR,
  ScheduleCalendar,
  TaskScheduleInput,
  ResourceTechnician,
  ResourceMachine,
  ResourceBookingInput,
} from '@/engines/schedule';

export class PlanningService {
  private readonly repo: PlanningRepository;

  constructor(private readonly db: PrismaClient) {
    this.repo = new PlanningRepository(db);
  }

  /**
   * Evaluates technician and machine suitability for a task against workflow node requirements,
   * certifications validity, skill levels, and schedule conflicts.
   */
  async evaluateAssignment(
    principal: Principal,
    rawInput: unknown
  ): Promise<AssignmentEvaluationResult> {
    requireAnyPermission(principal, ['planning.read', 'task.assign']);
    const input: EvaluateAssignmentInput = EvaluateAssignmentSchema.parse(rawInput);
    this.validateAssignmentWindow(input.scheduledStartAt, input.scheduledEndAt);
    return this.evaluateAssignmentWithClient(this.db, principal, input);
  }

  private validateAssignmentWindow(startAt?: string | Date, endAt?: string | Date) {
    if ((startAt === undefined) !== (endAt === undefined)) {
      throw new BadRequestError('Both assignment start and end times must be provided together');
    }
    if (startAt !== undefined && endAt !== undefined && new Date(startAt) >= new Date(endAt)) {
      throw new BadRequestError('Assignment start time must be before end time');
    }
  }

  private async evaluateAssignmentWithClient(
    client: PrismaClient | Prisma.TransactionClient,
    principal: Principal,
    input: EvaluateAssignmentInput
  ): Promise<AssignmentEvaluationResult> {
    const workspaceId = principal.workspaceId;

    const task = await client.task.findUnique({
      where: { workspaceId_id: { workspaceId, id: input.taskId } },
      include: {
        instance: {
          include: {
            workflowVersion: { include: { nodes: true, edges: true } },
            order: true,
          },
        },
      },
    });
    if (!task) {
      throw new NotFoundError(`Task '${input.taskId}' not found`);
    }

    const violations: string[] = [];
    const warnings: string[] = [];

    // Extract node requirements if available
    const node = task.instance.workflowVersion.nodes.find((n) => n.key === task.nodeKey);
    let requirements: {
      machineClassId?: string;
      requiredSkills?: Array<{ skillId: string; minLevel: number }>;
      requiredCertIds?: string[];
    } = {};

    if (node?.requirementsJson) {
      try {
        requirements = JSON.parse(node.requirementsJson);
      } catch {
        // ignore parse error
      }
    }

    if (
      (requirements.requiredSkills?.length || requirements.requiredCertIds?.length) &&
      !input.technicianId
    ) {
      violations.push('Task requirements require a technician assignment');
    }
    if (requirements.machineClassId && !input.machineId) {
      violations.push('Task requirements require a machine assignment');
    }

    // 1. Evaluate Technician
    if (input.technicianId) {
      const technician = await client.technician.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.technicianId,
          },
        },
        include: {
          skills: {
            include: { skill: true },
          },
          certifications: {
            include: { certification: true },
          },
        },
      });

      if (!technician) {
        violations.push(`Technician '${input.technicianId}' not found`);
      } else if (!technician.isActive || technician.archivedAt) {
        violations.push(`Technician '${technician.name}' is inactive or archived`);
      } else {
        // Check Skills
        if (requirements.requiredSkills && requirements.requiredSkills.length > 0) {
          for (const reqSkill of requirements.requiredSkills) {
            const techSkill = technician.skills.find(
              (s) => s.skillId === reqSkill.skillId || s.skill.code === reqSkill.skillId
            );
            if (!techSkill) {
              violations.push(
                `Technician '${technician.name}' lacks required skill '${reqSkill.skillId}'`
              );
            } else if (techSkill.level < reqSkill.minLevel) {
              violations.push(
                `Technician '${technician.name}' skill level (${techSkill.level}) is below required minimum (${reqSkill.minLevel})`
              );
            }
          }
        }

        // Check Certifications with expiration check
        if (requirements.requiredCertIds && requirements.requiredCertIds.length > 0) {
          const nowStr = new Date().toISOString().slice(0, 10);
          for (const certId of requirements.requiredCertIds) {
            const techCert = technician.certifications.find(
              (c) =>
                c.certificationId === certId ||
                c.certification.code === certId ||
                c.certification.name === certId
            );
            if (!techCert) {
              violations.push(
                `Technician '${technician.name}' lacks required certification '${certId}'`
              );
            } else if (techCert.validUntil < nowStr) {
              violations.push(
                `Technician '${technician.name}' certification '${techCert.certification.name}' expired on ${techCert.validUntil}`
              );
            }
          }
        }

        // Check Booking Conflicts
        if (input.scheduledStartAt && input.scheduledEndAt) {
          const start = new Date(input.scheduledStartAt);
          const end = new Date(input.scheduledEndAt);
          const conflict = await client.resourceBooking.findFirst({
            where: {
              workspaceId,
              resourceType: 'TECHNICIAN',
              resourceId: input.technicianId,
              taskId: { not: task.id },
              status: 'CONFIRMED',
              startAt: { lt: end },
              endAt: { gt: start },
            },
          });
          if (conflict) {
            violations.push(
              `Technician '${technician.name}' has an overlapping booking for task '${conflict.taskId}'`
            );
          }
        }
      }
    }

    // 2. Evaluate Machine
    if (input.machineId) {
      const machine = await client.machine.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: input.machineId,
          },
        },
        include: {
          machineClass: true,
        },
      });

      if (!machine) {
        violations.push(`Machine '${input.machineId}' not found`);
      } else if (machine.archivedAt) {
        violations.push(`Machine '${machine.name}' is archived`);
      } else if (machine.status === 'OFFLINE' || machine.status === 'MAINTENANCE') {
        violations.push(`Machine '${machine.name}' is currently ${machine.status}`);
      } else {
        // Check Machine Class
        if (requirements.machineClassId && machine.machineClassId !== requirements.machineClassId) {
          violations.push(
            `Machine '${machine.name}' belongs to class '${machine.machineClass.name}', but task requires '${requirements.machineClassId}'`
          );
        }

        // Check Booking Conflicts
        if (input.scheduledStartAt && input.scheduledEndAt) {
          const start = new Date(input.scheduledStartAt);
          const end = new Date(input.scheduledEndAt);
          const conflict = await client.resourceBooking.findFirst({
            where: {
              workspaceId,
              resourceType: 'MACHINE',
              resourceId: input.machineId,
              taskId: { not: task.id },
              status: 'CONFIRMED',
              startAt: { lt: end },
              endAt: { gt: start },
            },
          });
          if (conflict) {
            violations.push(
              `Machine '${machine.name}' has an overlapping booking for task '${conflict.taskId}'`
            );
          }
        }
      }
    }

    return {
      taskId: task.id,
      technicianId: input.technicianId ?? null,
      machineId: input.machineId ?? null,
      isEligible: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Assigns a technician and/or machine to a task, evaluating eligibility,
   * reserving resource slots via ResourceBooking records, and advancing task status to ASSIGNED.
   */
  async assignTask(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.assign', 'planning.write', 'resource.manage']);
    const input: AssignTaskInput = AssignTaskSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    this.validateAssignmentWindow(input.startAt, input.endAt);

    return executeCommand<any, any>({
      principal,
      commandType: 'task.assign',
      idempotencyKey: idempotencyKey || randomUUID(),
      expectedVersion: input.expectedVersion,
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const task = await tx.task.findUnique({
          where: {
            workspaceId_id: {
              workspaceId,
              id: input.taskId,
            },
          },
        });

        if (!task) {
          throw new NotFoundError(`Task '${input.taskId}' not found`);
        }
        if (task.version !== input.expectedVersion) {
          throw new ConflictError(
            `Resource version mismatch: expected ${input.expectedVersion}, but found ${task.version}`,
            'STALE_VERSION',
            true
          );
        }
        if (!['PENDING', 'READY', 'ASSIGNED'].includes(task.status)) {
          throw new BadRequestError(`Task cannot be assigned while status is ${task.status}`);
        }
        const predecessorDeps = await tx.taskDependency.findMany({
          where: { workspaceId, successorTaskId: task.id },
          include: { predecessor: { select: { status: true } } },
        });
        if (
          predecessorDeps.some(
            (dependency: { predecessor: { status: string } }) =>
              dependency.predecessor.status !== 'COMPLETED'
          )
        ) {
          throw new BadRequestError(
            'Task cannot be assigned until all predecessor tasks are completed'
          );
        }

        const existingBookings = await tx.resourceBooking.findMany({
          where: { workspaceId, taskId: task.id, status: 'CONFIRMED' },
          orderBy: { createdAt: 'asc' },
        });
        const effectiveTechnicianId =
          input.technicianId !== undefined ? input.technicianId : task.assignedTechnicianId;
        const effectiveMachineId =
          input.machineId !== undefined ? input.machineId : task.assignedMachineId;

        // Determine schedule window
        let startAt: Date;
        let endAt: Date;

        if (input.startAt && input.endAt) {
          startAt = new Date(input.startAt);
          endAt = new Date(input.endAt);
        } else if (existingBookings.length > 0) {
          const hasInconsistentWindows = existingBookings.some(
            (booking: { startAt: Date; endAt: Date }) =>
              booking.startAt.getTime() !== existingBookings[0].startAt.getTime() ||
              booking.endAt.getTime() !== existingBookings[0].endAt.getTime()
          );
          if (hasInconsistentWindows) {
            throw new ConflictError(
              'Task has confirmed resource bookings with inconsistent schedule windows',
              'INCONSISTENT_BOOKING_WINDOWS',
              false
            );
          }
          startAt = existingBookings[0].startAt;
          endAt = existingBookings[0].endAt;
        } else {
          const window = addWorkingMinutes(new Date(), task.plannedDurationMinutes);
          startAt = window.start;
          endAt = window.end;
        }

        const evalResult = await this.evaluateAssignmentWithClient(tx, principal, {
          taskId: input.taskId,
          technicianId: effectiveTechnicianId,
          machineId: effectiveMachineId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
        });
        if (!evalResult.isEligible) {
          throw new BadRequestError(
            `Assignment rejected due to violations:\n${evalResult.violations.join('\n')}`
          );
        }

        // Determine target status
        let newStatus = task.status;
        if (task.status === 'PENDING' || task.status === 'READY') {
          newStatus = 'ASSIGNED';
        }

        // Update task
        const updateResult = await tx.task.updateMany({
          where: {
            workspaceId,
            id: input.taskId,
            version: input.expectedVersion,
          },
          data: {
            assignedTechnicianId:
              input.technicianId !== undefined ? input.technicianId : task.assignedTechnicianId,
            assignedMachineId:
              input.machineId !== undefined ? input.machineId : task.assignedMachineId,
            status: newStatus,
            version: { increment: 1 },
          },
        });
        if (updateResult.count !== 1) {
          throw new ConflictError(
            `Resource version mismatch: expected ${input.expectedVersion}`,
            'STALE_VERSION',
            true
          );
        }
        const updatedTask = await tx.task.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.taskId } },
        });

        // Manage resource bookings
        const bookingsToCreate: Array<{
          resourceType: 'TECHNICIAN' | 'MACHINE';
          resourceId: string;
          startAt: Date;
          endAt: Date;
        }> = [];

        if (effectiveTechnicianId) {
          bookingsToCreate.push({
            resourceType: 'TECHNICIAN',
            resourceId: effectiveTechnicianId,
            startAt,
            endAt,
          });
        }
        if (effectiveMachineId) {
          bookingsToCreate.push({
            resourceType: 'MACHINE',
            resourceId: effectiveMachineId,
            startAt,
            endAt,
          });
        }

        const createdBookings = await this.repo.replaceBookingsForTask(
          tx,
          workspaceId,
          input.taskId,
          bookingsToCreate
        );

        // Record workflow event if status transitioned
        if (newStatus !== task.status) {
          await tx.workflowEvent.create({
            data: {
              workspaceId,
              instanceId: task.instanceId,
              taskId: task.id,
              fromStatus: task.status,
              toStatus: newStatus,
              action: 'ASSIGN',
              actorUserId: principal.userId,
              detailJson: JSON.stringify({
                technicianId: effectiveTechnicianId,
                machineId: effectiveMachineId,
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
                notes: input.notes,
              }),
            },
          });
        }

        return {
          data: {
            task: updatedTask,
            bookings: createdBookings,
            evaluation: evalResult,
          },
          aggregateType: 'TASK',
          aggregateId: task.id,
          previousVersion: task.version,
          resourceVersion: updatedTask.version,
        };
      },
    });
  }

  /**
   * Deterministic planning & scheduling across tasks, dependencies, shift calendars,
   * resource availability, and material supply dates.
   */
  async scheduleTasks(principal: Principal, rawInput: unknown) {
    requireAnyPermission(principal, ['planning.read', 'order.read', 'task.assign']);
    const input: ScheduleTasksRequest = ScheduleTasksRequestSchema.parse(rawInput || {});
    const workspaceId = principal.workspaceId;

    const [tasks, technicians, machines, existingBookings] = await Promise.all([
      this.repo.findTasksForScheduling(workspaceId, {
        orderId: input.orderId,
        instanceId: input.instanceId,
        taskIds: input.taskIds,
      }),
      this.repo.findTechnicians(workspaceId),
      this.repo.findMachines(workspaceId),
      this.repo.findExistingBookings(workspaceId),
    ]);

    const calendar: ScheduleCalendar = input.calendar
      ? {
          id: 'CUSTOM',
          shiftStartHour: input.calendar.shiftStartHour,
          shiftHours: input.calendar.shiftHours,
          workDays: input.calendar.workDays,
          timezone: input.calendar.timezone || 'Asia/Jakarta',
        }
      : DEFAULT_SCHEDULE_CALENDAR;

    // Map tasks to engine input format
    const engineTasks: TaskScheduleInput[] = tasks.map((t) => {
      const node = t.instance.workflowVersion.nodes.find((n) => n.key === t.nodeKey);
      let machineClassId: string | null = null;
      let skillCode: string | null = null;
      let certName: string | null = null;

      if (node?.requirementsJson) {
        try {
          const reqs = JSON.parse(node.requirementsJson);
          machineClassId = reqs.machineClassId || null;
          if (reqs.requiredSkills && reqs.requiredSkills.length > 0) {
            skillCode = reqs.requiredSkills[0].skillId;
          }
          if (reqs.requiredCertIds && reqs.requiredCertIds.length > 0) {
            certName = reqs.requiredCertIds[0];
          }
        } catch {
          // ignore
        }
      }

      // Check material delay from demands
      let materialAvailableAt: Date | null = null;
      const demands = t.instance.order?.demands.filter((d) => !d.taskId || d.taskId === t.id) || [];
      for (const d of demands) {
        if (d.needByDate && (!materialAvailableAt || d.needByDate > materialAvailableAt)) {
          materialAvailableAt = d.needByDate;
        }
      }

      return {
        id: t.id,
        version: t.version,
        name: node?.name || t.nodeKey,
        plannedDurationMinutes: t.plannedDurationMinutes || 60,
        predecessorTaskIds: t.predecessorDeps.map((p) => p.predecessorTaskId),
        requiredMachineClassId: machineClassId,
        requiredSkillCode: skillCode,
        requiredCertName: certName,
        materialAvailableAt,
        assignedTechnicianId: t.assignedTechnicianId,
        assignedMachineId: t.assignedMachineId,
      };
    });

    const engineTechs: ResourceTechnician[] = technicians.map((tech) => ({
      id: tech.id,
      name: tech.name,
      skills: tech.skills.map((s) => ({ skillCode: s.skill.code, level: s.level })),
      certifications: tech.certifications.map((c) => ({
        name: c.certification.code,
        validUntil: c.validUntil,
      })),
      calendarId: tech.calendarId || undefined,
      isActive: tech.isActive,
    }));

    const engineMachines: ResourceMachine[] = machines.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      machineClassId: m.machineClassId,
      calendarId: m.calendarId || undefined,
      isActive: !m.archivedAt && m.status !== 'OFFLINE' && m.status !== 'MAINTENANCE',
    }));

    const engineBookings: ResourceBookingInput[] = existingBookings.map((b) => ({
      resourceType: b.resourceType as 'TECHNICIAN' | 'MACHINE',
      resourceId: b.resourceId,
      startAt: b.startAt,
      endAt: b.endAt,
      taskId: b.taskId,
    }));

    const scheduleResult = runScheduleEngine({
      tasks: engineTasks,
      startHorizon: input.startHorizon ? new Date(input.startHorizon) : new Date(),
      calendar,
      technicians: engineTechs,
      machines: engineMachines,
      existingBookings: engineBookings,
    });

    return scheduleResult;
  }
}

import { db } from '@/server/db/client';
export const planningService = new PlanningService(db);
