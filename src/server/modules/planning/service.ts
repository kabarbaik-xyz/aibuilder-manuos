import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { db } from '@/server/db/client';
import { PlanningRepository } from './repository';
import { AvailabilityService } from './availability';
import {
  ScheduleTasksRequest,
  ScheduleTasksRequestSchema,
  EvaluateAssignmentInput,
  EvaluateAssignmentSchema,
  AssignTaskInput,
  AssignTaskSchema,
  AssignmentEvaluationResult,
  TaskPlanningDTO,
  RescheduleAssignmentSchema,
  CancelAssignmentSchema,
  TaskDispatchReadinessDTO,
} from './contracts';
import { NotificationService } from '../notifications/service';
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
  private readonly db: PrismaClient;
  private readonly repo: PlanningRepository;
  private readonly notificationService: NotificationService;

  constructor(prismaClient?: PrismaClient) {
    const activeDb = prismaClient ?? db;
    this.db = activeDb;
    this.repo = new PlanningRepository(activeDb);
    this.notificationService = new NotificationService(activeDb);
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
    if (startAt !== undefined && endAt !== undefined) {
      const start = new Date(startAt).getTime();
      const end = new Date(endAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new BadRequestError('Assignment start and end must be valid dates with start before end');
      }
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

    if ((input.technicianId || input.machineId) && (!input.scheduledStartAt || !input.scheduledEndAt)) {
      violations.push('A scheduled time window is required to verify published availability');
    } else if (input.scheduledStartAt && input.scheduledEndAt) {
      const availability = new AvailabilityService(client);
      const startAt = new Date(input.scheduledStartAt);
      const endAt = new Date(input.scheduledEndAt);
      const resources: Array<{ type: 'TECHNICIAN' | 'MACHINE'; id: string; label: string }> = [];
      if (input.technicianId) resources.push({ type: 'TECHNICIAN', id: input.technicianId, label: 'Technician' });
      if (input.machineId) resources.push({ type: 'MACHINE', id: input.machineId, label: 'Machine' });

      for (const resource of resources) {
        const intervals = await availability.getAvailableIntervals(principal, {
          resourceType: resource.type,
          resourceId: resource.id,
          startAt,
          endAt,
          excludeTaskId: task.id,
        });
        if (!intervals.some((interval) => interval.startAt <= startAt && interval.endAt >= endAt)) {
          violations.push(`${resource.label} '${resource.id}' has no published availability covering the full assignment window`);
        }
      }
    }

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

    // Facility match check if order has facility scope
    const orderFacilityId = task.instance?.order?.facilityId;
    if (orderFacilityId) {
      if (input.technicianId) {
        const techFac = await client.technician.findFirst({
          where: { id: input.technicianId, workspaceId },
        });
        if (techFac && techFac.facilityId && techFac.facilityId !== orderFacilityId) {
          let hasGrant = false;
          if (techFac.membershipId) {
            const grant = await client.membershipFacilityGrant.findFirst({
              where: { workspaceId, membershipId: techFac.membershipId, facilityId: orderFacilityId },
            });
            hasGrant = !!grant;
          }
          if (!hasGrant) {
            violations.push(
              `Technician '${techFac.name}' belongs to facility '${techFac.facilityId}' and lacks access to order facility '${orderFacilityId}'`
            );
          }
        }
      }

      if (input.machineId) {
        const machFac = await client.machine.findFirst({
          where: { id: input.machineId, workspaceId },
        });
        if (machFac && machFac.facilityId && machFac.facilityId !== orderFacilityId) {
          violations.push(
            `Machine '${machFac.name}' belongs to facility '${machFac.facilityId}' and does not match order facility '${orderFacilityId}'`
          );
        }
      }
    }

    // Material demands coverage check (advisory warnings)
    const demands = await client.materialDemand.findMany({
      where: { workspaceId, taskId: task.id },
      include: { item: true, reservations: true },
    });
    for (const d of demands) {
      const allocatedAtoms = d.reservations
        .filter((r) => r.status === 'ACTIVE')
        .reduce((sum, r) => sum + r.reservedAtoms, 0n);
      if (d.status !== 'ALLOCATED' && d.status !== 'ISSUED' && allocatedAtoms < d.requiredAtoms) {
        warnings.push(
          `Material demand for '${d.item.name}' is only partially allocated (${allocatedAtoms.toString()}/${d.requiredAtoms.toString()} atoms)`
        );
      }
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
            } else if (techSkill.assessmentStatus && techSkill.assessmentStatus !== 'VERIFIED') {
              violations.push(
                `Technician '${technician.name}' skill '${reqSkill.skillId}' has unverified status '${techSkill.assessmentStatus}'`
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
            } else if (techCert.status && techCert.status !== 'ACTIVE') {
              violations.push(
                `Technician '${technician.name}' certification '${techCert.certification.name}' is revoked or inactive`
              );
            } else if (techCert.validUntil < nowStr) {
              violations.push(
                `Technician '${technician.name}' certification '${techCert.certification.name}' expired on ${techCert.validUntil}`
              );
            } else if (input.scheduledEndAt && techCert.expiresAtDate && techCert.expiresAtDate < new Date(input.scheduledEndAt)) {
              violations.push(
                `Technician '${technician.name}' certification '${techCert.certification.name}' expires on ${techCert.expiresAtDate.toISOString()}, before task end`
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

        // Check Machine Downtime
        if (input.scheduledStartAt && input.scheduledEndAt) {
          const mStart = new Date(input.scheduledStartAt);
          const mEnd = new Date(input.scheduledEndAt);
          const dt = await client.machineDowntime.findFirst({
            where: {
              workspaceId,
              machineId: input.machineId,
              status: { in: ['SCHEDULED', 'ACTIVE'] },
              startAt: { lt: mEnd },
              endAt: { gt: mStart },
            },
          });
          if (dt) {
            violations.push(`Machine '${machine.name}' has scheduled downtime: ${dt.reason}`);
          }
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

        // Send notification to assigned technician if membership exists
        if (effectiveTechnicianId) {
          const assignedTech = await tx.technician.findFirst({
            where: { id: effectiveTechnicianId, workspaceId },
          });
          if (assignedTech?.membershipId) {
            const member = await tx.membership.findFirst({
              where: { id: assignedTech.membershipId, workspaceId },
            });
            if (member?.userId) {
              await tx.notificationInbox.create({
                data: {
                  workspaceId,
                  userId: member.userId,
                  title: `Task Assigned: ${task.nodeKey}`,
                  body: `You have been assigned to task ${task.nodeKey} (${startAt.toISOString().slice(11, 16)} - ${endAt.toISOString().slice(11, 16)})`,
                  subjectType: 'TASK',
                  subjectId: task.id,
                  status: 'UNREAD',
                },
              });
            }
          }
        }

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

    const [tasks, technicians, machines, existingBookings, confirmedSupplyLines] = await Promise.all([
      this.repo.findTasksForScheduling(workspaceId, {
        orderId: input.orderId,
        instanceId: input.instanceId,
        taskIds: input.taskIds,
      }),
      this.repo.findTechnicians(workspaceId),
      this.repo.findMachines(workspaceId),
      this.repo.findExistingBookings(workspaceId),
      this.db.supplyOrderLine.findMany({
        where: {
          workspaceId,
          supplyOrder: { status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
        },
        include: { supplyOrder: true },
        orderBy: { supplyOrder: { expectedDate: "asc" } },
      }),
    ]);

    const supplyEtaByItem = new Map<string, Date>();
    for (const sol of confirmedSupplyLines) {
      if (sol.supplyOrder?.expectedDate && !supplyEtaByItem.has(sol.itemId)) {
        supplyEtaByItem.set(sol.itemId, sol.supplyOrder.expectedDate);
      }
    }

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

      // Check material arrival from confirmed supply orders (never use demand need-by date as supply arrival)
      let materialAvailableAt: Date | null = null;
      const demands = t.instance.order?.demands.filter((d) => !d.taskId || d.taskId === t.id) || [];
      for (const d of demands) {
        if (d.status !== "ALLOCATED" && d.status !== "ISSUED") {
          const supplyEta = supplyEtaByItem.get(d.itemId);
          if (supplyEta && (!materialAvailableAt || supplyEta > materialAvailableAt)) {
            materialAvailableAt = supplyEta;
          }
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

  /**
   * Cancels a task assignment, releases confirmed resource bookings, and returns task to READY status.
   */
  async cancelTaskAssignment(
    principal: Principal,
    taskId: string,
    input?: { notes?: string },
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.assign', 'planning.write', 'resource.manage']);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'task.assignment.cancel',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { taskId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const task = await tx.task.findUnique({
          where: { workspaceId_id: { workspaceId, id: taskId } },
        });
        if (!task) throw new NotFoundError(`Task '${taskId}' not found`);

        if (['RUNNING', 'COMPLETED', 'CANCELLED'].includes(task.status)) {
          throw new BadRequestError(`Cannot cancel assignment for task in status '${task.status}'`);
        }

        // Cancel confirmed bookings
        await tx.resourceBooking.updateMany({
          where: { workspaceId, taskId, status: 'CONFIRMED' },
          data: { status: 'CANCELLED' },
        });

        const updatedTask = await tx.task.update({
          where: { workspaceId_id: { workspaceId, id: taskId } },
          data: {
            assignedTechnicianId: null,
            assignedMachineId: null,
            status: 'READY',
            version: { increment: 1 },
          },
        });

        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: task.status,
            toStatus: 'READY',
            action: 'CANCEL_ASSIGNMENT',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({ notes: input?.notes }),
          },
        });

        return {
          data: updatedTask,
          aggregateType: 'TASK',
          aggregateId: task.id,
          previousVersion: task.version,
          resourceVersion: updatedTask.version,
        };
      },
    });
  }

  /**
   * Reschedules an assigned task to a new time window, validating eligibility and replacing bookings atomically.
   */
  async rescheduleTaskAssignment(
    principal: Principal,
    taskId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.assign', 'planning.write', 'resource.manage']);
    const input = RescheduleAssignmentSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    this.validateAssignmentWindow(input.startAt, input.endAt);

    return executeCommand({
      principal,
      commandType: 'task.assignment.reschedule',
      idempotencyKey: idempotencyKey || randomUUID(),
      expectedVersion: input.expectedVersion,
      payload: { taskId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const task = await tx.task.findUnique({
          where: { workspaceId_id: { workspaceId, id: taskId } },
        });
        if (!task) throw new NotFoundError(`Task '${taskId}' not found`);

        if (task.version !== input.expectedVersion) {
          throw new ConflictError(
            `Resource version mismatch: expected ${input.expectedVersion}, but found ${task.version}`,
            'STALE_VERSION',
            true
          );
        }

        if (!['ASSIGNED', 'READY', 'PENDING'].includes(task.status)) {
          throw new BadRequestError(`Cannot reschedule task in status '${task.status}'`);
        }

        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);

        const evalResult = await this.evaluateAssignmentWithClient(tx, principal, {
          taskId,
          technicianId: task.assignedTechnicianId,
          machineId: task.assignedMachineId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
        });

        if (!evalResult.isEligible) {
          throw new BadRequestError(
            `Reschedule rejected due to violations:\n${evalResult.violations.join('\n')}`
          );
        }

        // Replace bookings
        const bookingsToCreate: Array<{
          resourceType: 'TECHNICIAN' | 'MACHINE';
          resourceId: string;
          startAt: Date;
          endAt: Date;
        }> = [];

        if (task.assignedTechnicianId) {
          bookingsToCreate.push({
            resourceType: 'TECHNICIAN',
            resourceId: task.assignedTechnicianId,
            startAt,
            endAt,
          });
        }
        if (task.assignedMachineId) {
          bookingsToCreate.push({
            resourceType: 'MACHINE',
            resourceId: task.assignedMachineId,
            startAt,
            endAt,
          });
        }

        const createdBookings = await this.repo.replaceBookingsForTask(
          tx,
          workspaceId,
          taskId,
          bookingsToCreate
        );

        const updatedTask = await tx.task.update({
          where: { workspaceId_id: { workspaceId, id: taskId } },
          data: {
            version: { increment: 1 },
          },
        });

        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: task.status,
            toStatus: task.status,
            action: 'RESCHEDULE',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              notes: input.notes,
            }),
          },
        });

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
   * Returns comprehensive dispatch readiness model with predecessor status, material coverage, and evaluation.
   */
  async getTaskDispatchReadiness(
    principal: Principal,
    taskId: string
  ): Promise<TaskDispatchReadinessDTO> {
    requireAnyPermission(principal, ['planning.read', 'task.assign']);
    const workspaceId = principal.workspaceId;

    const task = await this.db.task.findUnique({
      where: { workspaceId_id: { workspaceId, id: taskId } },
      include: {
        instance: {
          include: {
            order: true,
            workflowVersion: { include: { nodes: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundError(`Task '${taskId}' not found`);

    const predecessorDeps = await this.db.taskDependency.findMany({
      where: { workspaceId, successorTaskId: task.id },
      include: { predecessor: true },
    });
    const uncompletedPreds = predecessorDeps
      .filter((d) => d.predecessor.status !== 'COMPLETED')
      .map((d) => ({
        id: d.predecessor.id,
        nodeKey: d.predecessor.nodeKey,
        status: d.predecessor.status,
      }));

    const demands = await this.db.materialDemand.findMany({
      where: { workspaceId, taskId: task.id },
      include: { reservations: true },
    });
    const uncoveredDemands = demands
      .map((d) => {
        const allocatedAtoms = d.reservations
          .filter((r) => r.status === 'ACTIVE')
          .reduce((sum, r) => sum + r.reservedAtoms, 0n);
        const isCovered =
          d.status === 'ALLOCATED' || d.status === 'ISSUED' || allocatedAtoms >= d.requiredAtoms;
        return {
          id: d.id,
          itemId: d.itemId,
          requiredAtoms: d.requiredAtoms.toString(),
          allocatedAtoms: allocatedAtoms.toString(),
          isCovered,
        };
      })
      .filter((d) => !d.isCovered)
      .map(({ id, itemId, requiredAtoms, allocatedAtoms }) => ({
        id,
        itemId,
        requiredAtoms,
        allocatedAtoms,
      }));

    const evaluation = await this.evaluateAssignmentWithClient(this.db, principal, {
      taskId,
      technicianId: task.assignedTechnicianId,
      machineId: task.assignedMachineId,
    });

    let readinessStatus: TaskDispatchReadinessDTO['readinessStatus'] = 'READY';
    if (task.status === 'RUNNING') readinessStatus = 'IN_PROGRESS';
    else if (task.status === 'COMPLETED') readinessStatus = 'COMPLETED';
    else if (task.status === 'ASSIGNED') readinessStatus = 'ASSIGNED';
    else if (uncompletedPreds.length > 0) readinessStatus = 'WAITING_PREDECESSOR';
    else if (uncoveredDemands.length > 0) readinessStatus = 'BLOCKED_MATERIAL';

    return {
      taskId: task.id,
      readinessStatus,
      uncompletedPredecessors: uncompletedPreds,
      uncoveredDemands,
      evaluation,
    };
  }
}

export const planningService = new PlanningService();
