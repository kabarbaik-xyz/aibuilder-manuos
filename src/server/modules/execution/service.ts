import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission, hasPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/domain/errors';
import { ExecutionRepository } from './repository';
import { ConsumptionService } from '../inventory/consumption';
import {
  StartTaskInput,
  StartTaskSchema,
  PauseTaskInput,
  PauseTaskSchema,
  ResumeTaskInput,
  ResumeTaskSchema,
  TaskExecutionDetailDTO,
  MyTaskSummaryDTO,
  WorkSessionDTO,
  CreateTaskIssueSchema,
  ResolveTaskIssueSchema,
  ReopenTaskIssueSchema,
  TaskIssueDTO,
  ScanCodeSchema,
  ScanResultDTO,
  TechnicianProfileDTO,
} from './contracts';
import { NotificationService } from '../notifications/service';

export class ExecutionService {
  private readonly repo: ExecutionRepository;
  private readonly consumptionService: ConsumptionService;
  private readonly notificationService: NotificationService;

  constructor(private readonly db: PrismaClient) {
    this.repo = new ExecutionRepository(db);
    this.consumptionService = new ConsumptionService(db);
    this.notificationService = new NotificationService(db);
  }

  /**
   * Authoritatively starts a task on the shop floor.
   * Validates predecessor task completion, material readiness, and operator authorization.
   * Creates a live server-timestamped WorkSession and updates status to RUNNING.
   */
  async startTask(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input: StartTaskInput = StartTaskSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const task = await this.repo.findTaskWithExecutionDetails(workspaceId, input.taskId);
    if (!task) {
      throw new NotFoundError(`Task '${input.taskId}' not found`);
    }

    // 1. Status check: task must be READY or ASSIGNED
    if (task.status === 'RUNNING') {
      // Already running: return idempotent response
      const activeSession = await this.repo.findActiveSession(workspaceId, task.id);
      return {
        data: { task, session: activeSession },
        resourceVersion: task.version,
      };
    }

    if (task.status !== 'READY' && task.status !== 'ASSIGNED') {
      throw new BadRequestError(
        `Cannot start task in status '${task.status}'. Must be in READY or ASSIGNED status.`
      );
    }

    const blockingIssue = await this.db.taskIssue.findFirst({
      where: {
        workspaceId,
        taskId: task.id,
        status: { in: ['OPEN', 'REOPENED'] },
        severity: { in: ['CRITICAL', 'HIGH'] },
      },
    });
    if (blockingIssue) {
      throw new BadRequestError(
        `Cannot start task '${task.nodeKey}': task is blocked by unresolved issue '${blockingIssue.title}'`
      );
    }

    // 2. Predecessor dependencies validation
    for (const dep of task.predecessorDeps) {
      if (dep.predecessor.status !== 'COMPLETED') {
        throw new BadRequestError(
          `Cannot start task '${task.nodeKey}': predecessor task '${dep.predecessor.nodeKey}' has status '${dep.predecessor.status}', but must be COMPLETED.`
        );
      }
    }

    // 3. Operator assignment check
    const isSupervisor =
      hasPermission(principal, 'task.assign') ||
      hasPermission(principal, 'planning.write') ||
      hasPermission(principal, 'workspace.admin') ||
      hasPermission(principal, 'owner');

    let effectiveTechnicianId = task.assignedTechnicianId;
    if (input.technicianId && input.technicianId !== principal.technicianId) {
      if (!isSupervisor) {
        throw new ForbiddenError('Only supervisors can start a task on behalf of another technician.');
      }
      effectiveTechnicianId = input.technicianId;
    } else if (input.technicianId && input.technicianId === principal.technicianId) {
      effectiveTechnicianId = input.technicianId;
    } else if (principal.technicianId) {
      if (task.assignedTechnicianId && task.assignedTechnicianId !== principal.technicianId) {
        if (!isSupervisor) {
          throw new ForbiddenError(
            `Task '${task.nodeKey}' is assigned to another technician.`
          );
        }
      }
      effectiveTechnicianId = principal.technicianId;
    } else if (task.assignedTechnicianId) {
      if (!isSupervisor) {
        throw new ForbiddenError(
          `Task '${task.nodeKey}' is assigned to another technician.`
        );
      }
      effectiveTechnicianId = task.assignedTechnicianId;
    }

    if (!effectiveTechnicianId) {
      throw new BadRequestError(
        'Cannot start task: no assigned technician and principal has no linked technician profile.'
      );
    }

    // 4. Material Readiness check — every demand must be fully covered by
    // issued WIP, active reservations, or unreserved warehouse stock. Starting
    // on "any one demand has some stock" silently green-lights short starts.
    const readiness = await this.consumptionService.getTaskMaterialReadiness(
      principal,
      task.id
    );

    if (readiness.demands.length > 0) {
      const undercovered = readiness.demands.filter(
        (d) => d.issuedAtoms + d.reservedAtoms + d.availableInWarehouseAtoms < d.requiredAtoms
      );
      if (undercovered.length > 0) {
        const detail = undercovered
          .map(
            (d) =>
              `${d.itemCode} requires ${d.requiredAtoms} atoms, only ${(
                d.issuedAtoms + d.reservedAtoms + d.availableInWarehouseAtoms
              )} covered`
          )
          .join('; ');
        throw new BadRequestError(
          `Cannot start task '${task.nodeKey}': material demands lack full coverage (${detail}).`
        );
      }
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'task.start',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const now = new Date();

        // Close any dangling active sessions if any exist
        const danglingSession = await tx.workSession.findFirst({
          where: { workspaceId, taskId: task.id, endedAt: null },
        });
        if (danglingSession) {
          const duration = Math.max(1, Math.round((now.getTime() - danglingSession.startedAt.getTime()) / 60000));
          await tx.workSession.update({
            where: { id: danglingSession.id },
            data: { endedAt: now, durationMinutes: duration },
          });
        }

        // Create new RUNNING work session
        const session = await this.repo.createWorkSession(tx, {
          workspaceId,
          taskId: task.id,
          technicianId: effectiveTechnicianId!,
          sessionType: 'RUNNING',
          startedAt: now,
          notes: input.notes,
        });

        // Update task status and startedAt
        const updatedTask = await tx.task.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: task.id,
            },
          },
          data: {
            status: 'RUNNING',
            startedAt: task.startedAt ?? now,
            assignedTechnicianId: effectiveTechnicianId,
            version: { increment: 1 },
          },
        });

        // Update Order to IN_PRODUCTION if RELEASED
        if (task.instance.order.status === 'RELEASED') {
          await tx.order.update({
            where: {
              workspaceId_id: {
                workspaceId,
                id: task.instance.orderId,
              },
            },
            data: {
              status: 'IN_PRODUCTION',
              version: { increment: 1 },
            },
          });
        }

        // Record Workflow Event
        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: task.status,
            toStatus: 'RUNNING',
            action: 'START',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({
              technicianId: effectiveTechnicianId,
              startedAt: now.toISOString(),
              notes: input.notes,
            }),
          },
        });

        return {
          data: {
            task: updatedTask,
            session,
          },
          aggregateType: 'TASK',
          aggregateId: task.id,
          resourceVersion: updatedTask.version,
        };
      },
    });
  }

  /**
   * Pauses an active RUNNING task.
   * Closes the active session, calculates actual duration, and creates a PAUSED session.
   */
  async pauseTask(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input: PauseTaskInput = PauseTaskSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const task = await this.repo.findTaskWithExecutionDetails(workspaceId, input.taskId);
    if (!task) {
      throw new NotFoundError(`Task '${input.taskId}' not found`);
    }

    if (task.status === 'PAUSED') {
      const activeSession = await this.repo.findActiveSession(workspaceId, task.id);
      return {
        data: { task, session: activeSession },
        resourceVersion: task.version,
      };
    }

    if (task.status !== 'RUNNING') {
      throw new BadRequestError(
        `Cannot pause task in status '${task.status}'. Task must be RUNNING.`
      );
    }

    const isSupervisor =
      hasPermission(principal, 'task.assign') ||
      hasPermission(principal, 'planning.write') ||
      hasPermission(principal, 'workspace.admin') ||
      hasPermission(principal, 'owner');

    if (!isSupervisor && task.assignedTechnicianId && (!principal.technicianId || task.assignedTechnicianId !== principal.technicianId)) {
      throw new ForbiddenError(
        `Cannot pause task '${task.nodeKey}': task is assigned to another technician.`
      );
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'task.pause',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const now = new Date();

        // 1. Close active RUNNING session
        const activeSession = await tx.workSession.findFirst({
          where: {
            workspaceId,
            taskId: task.id,
            sessionType: 'RUNNING',
            endedAt: null,
          },
          orderBy: { startedAt: 'desc' },
        });

        let addedMinutes = 0;
        if (activeSession) {
          addedMinutes = Math.max(
            1,
            Math.round((now.getTime() - activeSession.startedAt.getTime()) / 60000)
          );
          await tx.workSession.update({
            where: { id: activeSession.id },
            data: {
              endedAt: now,
              durationMinutes: addedMinutes,
              version: { increment: 1 },
            },
          });
        }

        // 2. Create PAUSED session
        const technicianId =
          activeSession?.technicianId || task.assignedTechnicianId || principal.technicianId!;
        const pauseSession = await tx.workSession.create({
          data: {
            workspaceId,
            taskId: task.id,
            technicianId,
            sessionType: 'PAUSED',
            startedAt: now,
            notes: `${input.reason}${input.notes ? `: ${input.notes}` : ''}`,
          },
        });

        // 3. Update Task
        const updatedTask = await tx.task.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: task.id,
            },
          },
          data: {
            status: 'PAUSED',
            actualDurationMinutes: { increment: addedMinutes },
            version: { increment: 1 },
          },
        });

        // 4. Record Workflow Event
        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: 'RUNNING',
            toStatus: 'PAUSED',
            action: 'PAUSE',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({
              reason: input.reason,
              notes: input.notes,
              pausedAt: now.toISOString(),
            }),
          },
        });

        return {
          data: {
            task: updatedTask,
            session: pauseSession,
          },
          aggregateType: 'TASK',
          aggregateId: task.id,
          resourceVersion: updatedTask.version,
        };
      },
    });
  }

  /**
   * Resumes a PAUSED task.
   * Closes the PAUSED session and starts a new RUNNING session.
   */
  async resumeTask(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input: ResumeTaskInput = ResumeTaskSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const task = await this.repo.findTaskWithExecutionDetails(workspaceId, input.taskId);
    if (!task) {
      throw new NotFoundError(`Task '${input.taskId}' not found`);
    }

    if (task.status === 'RUNNING') {
      const activeSession = await this.repo.findActiveSession(workspaceId, task.id);
      return {
        data: { task, session: activeSession },
        resourceVersion: task.version,
      };
    }

    if (task.status !== 'PAUSED') {
      throw new BadRequestError(
        `Cannot resume task in status '${task.status}'. Task must be PAUSED.`
      );
    }

    const isResumeSupervisor =
      hasPermission(principal, 'task.assign') ||
      hasPermission(principal, 'planning.write') ||
      hasPermission(principal, 'workspace.admin') ||
      hasPermission(principal, 'owner');

    if (!isResumeSupervisor && task.assignedTechnicianId && (!principal.technicianId || task.assignedTechnicianId !== principal.technicianId)) {
      throw new ForbiddenError(
        `Cannot resume task '${task.nodeKey}': task is assigned to another technician.`
      );
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'task.resume',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const now = new Date();

        // 1. Close active PAUSED session
        const activePause = await tx.workSession.findFirst({
          where: {
            workspaceId,
            taskId: task.id,
            sessionType: 'PAUSED',
            endedAt: null,
          },
          orderBy: { startedAt: 'desc' },
        });

        if (activePause) {
          const pauseMinutes = Math.max(
            0,
            Math.round((now.getTime() - activePause.startedAt.getTime()) / 60000)
          );
          await tx.workSession.update({
            where: { id: activePause.id },
            data: {
              endedAt: now,
              durationMinutes: pauseMinutes,
              version: { increment: 1 },
            },
          });
        }

        // 2. Create new RUNNING session
        const technicianId =
          activePause?.technicianId || task.assignedTechnicianId || principal.technicianId!;
        const runningSession = await tx.workSession.create({
          data: {
            workspaceId,
            taskId: task.id,
            technicianId,
            sessionType: 'RUNNING',
            startedAt: now,
            notes: input.notes,
          },
        });

        // 3. Update task status
        const updatedTask = await tx.task.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: task.id,
            },
          },
          data: {
            status: 'RUNNING',
            version: { increment: 1 },
          },
        });

        // 4. Record Workflow Event
        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: 'PAUSED',
            toStatus: 'RUNNING',
            action: 'RESUME',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({
              resumedAt: now.toISOString(),
              notes: input.notes,
            }),
          },
        });

        return {
          data: {
            task: updatedTask,
            session: runningSession,
          },
          aggregateType: 'TASK',
          aggregateId: task.id,
          resourceVersion: updatedTask.version,
        };
      },
    });
  }

  /**
   * Retrieves full execution details for shop floor operator view.
   */
  async getTaskExecutionDetail(
    principal: Principal,
    taskId: string
  ): Promise<TaskExecutionDetailDTO> {
    const workspaceId = principal.workspaceId;
    const task = await this.repo.findTaskWithExecutionDetails(workspaceId, taskId);
    if (!task) {
      throw new NotFoundError(`Task '${taskId}' not found`);
    }

    const readiness = await this.consumptionService.getTaskMaterialReadiness(principal, taskId);
    const node = task.instance.workflowVersion.nodes.find((n) => n.key === task.nodeKey);

    const sessionsDTO: WorkSessionDTO[] = task.workSessions.map((s) => ({
      id: s.id,
      workspaceId: s.workspaceId,
      taskId: s.taskId,
      technicianId: s.technicianId,
      technicianName: s.technician?.name,
      sessionType: s.sessionType as 'RUNNING' | 'PAUSED',
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      durationMinutes: s.durationMinutes,
      notes: s.notes,
    }));

    const activeSession = sessionsDTO.find((s) => s.endedAt === null) || null;

    // Derive current elapsed minutes from server session timestamps
    let currentElapsedMinutes = task.actualDurationMinutes;
    if (activeSession && activeSession.sessionType === 'RUNNING') {
      const liveMinutes = Math.max(
        0,
        Math.round((Date.now() - new Date(activeSession.startedAt).getTime()) / 60000)
      );
      currentElapsedMinutes += liveMinutes;
    }

    const predecessors = task.predecessorDeps.map((dep) => ({
      taskId: dep.predecessor.id,
      nodeKey: dep.predecessor.nodeKey,
      status: dep.predecessor.status,
      isCompleted: dep.predecessor.status === 'COMPLETED',
    }));

    return {
      id: task.id,
      workspaceId: task.workspaceId,
      instanceId: task.instanceId,
      jobsheetId: task.jobsheetId,
      nodeKey: task.nodeKey,
      nodeName: node?.name || task.nodeKey,
      status: task.status,
      attemptNumber: task.attemptNumber,
      plannedDurationMinutes: task.plannedDurationMinutes,
      actualDurationMinutes: task.actualDurationMinutes,
      currentElapsedMinutes,
      startedAt: task.startedAt ? task.startedAt.toISOString() : null,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      assignedTechnician: task.assignedTechnician
        ? {
            id: task.assignedTechnician.id,
            code: task.assignedTechnician.code,
            name: task.assignedTechnician.name,
          }
        : null,
      assignedMachine: task.assignedMachine
        ? {
            id: task.assignedMachine.id,
            code: task.assignedMachine.code,
            name: task.assignedMachine.name,
          }
        : null,
      order: {
        id: task.instance.order.id,
        orderNumber: task.instance.order.orderNumber,
        customerId: task.instance.order.customer.id,
        customerName: task.instance.order.customer.name,
        itemId: task.instance.order.item.id,
        itemCode: task.instance.order.item.code,
        itemName: task.instance.order.item.name,
        targetAtoms: task.targetAtoms.toString(),
      },
      instructionRevision: task.jobsheet?.instructionRevision || 1,
      predecessors,
      materialReadiness: readiness,
      activeSession,
      sessions: sessionsDTO,
    };
  }

  /**
   * Lists tasks for execution for the current operator.
   */
  async getMyTasks(principal: Principal): Promise<MyTaskSummaryDTO[]> {
    const workspaceId = principal.workspaceId;
    const isSupervisor =
      hasPermission(principal, 'planning.read') ||
      hasPermission(principal, 'task.assign') ||
      hasPermission(principal, 'workspace.admin');

    const tasks = await this.repo.listTasksForExecution(
      workspaceId,
      principal.technicianId,
      isSupervisor
    );

    return tasks.map((t) => {
      const node = t.instance.workflowVersion.nodes.find((n) => n.key === t.nodeKey);
      const activeSession = t.workSessions[0];

      let currentElapsedMinutes = t.actualDurationMinutes;
      if (activeSession && activeSession.sessionType === 'RUNNING' && !activeSession.endedAt) {
        currentElapsedMinutes += Math.max(
          0,
          Math.round((Date.now() - activeSession.startedAt.getTime()) / 60000)
        );
      }

      // Check if predecessors completed
      const allPredecessorsCompleted = t.predecessorDeps.every(
        (p) => p.predecessor.status === 'COMPLETED'
      );

      let canStart = false;
      let blockReason: string | undefined;

      if (t.status === 'COMPLETED' || t.status === 'CANCELLED') {
        canStart = false;
        blockReason = `Task is already ${t.status}`;
      } else if (!allPredecessorsCompleted) {
        canStart = false;
        blockReason = 'Waiting for predecessor tasks to complete';
      } else if (t.status === 'READY' || t.status === 'ASSIGNED') {
        canStart = true;
      } else if (t.status === 'RUNNING' || t.status === 'PAUSED') {
        canStart = true;
      }

      return {
        id: t.id,
        nodeKey: t.nodeKey,
        nodeName: node?.name || t.nodeKey,
        status: t.status,
        orderNumber: t.instance.order.orderNumber,
        customerName: t.instance.order.customer.name,
        itemName: t.instance.order.item.name,
        plannedDurationMinutes: t.plannedDurationMinutes,
        actualDurationMinutes: t.actualDurationMinutes,
        currentElapsedMinutes,
        activeSessionType: activeSession ? (activeSession.sessionType as 'RUNNING' | 'PAUSED') : null,
        canStart,
        blockReason,
      };
    });
  }

  /**
   * Creates a recorded blocker or operational issue for a task, notifying responsible owners.
   */
  async createTaskIssue(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input = CreateTaskIssueSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;
    const commandKey = idempotencyKey || randomUUID();

    return executeCommand({
      principal,
      commandType: 'task.issue.create',
      idempotencyKey: commandKey,
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        const task = await tx.task.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.taskId } },
        });
        if (!task) throw new NotFoundError(`Task '${input.taskId}' not found`);

        if (input.issueReasonId) {
          const reason = await tx.issueReason.findFirst({
            where: { id: input.issueReasonId, workspaceId, isActive: true },
          });
          if (!reason) {
            throw new BadRequestError(`IssueReason '${input.issueReasonId}' not found or inactive`);
          }
        }

        const issue = await tx.taskIssue.create({
          data: {
            workspaceId,
            taskId: task.id,
            issueReasonId: input.issueReasonId,
            title: input.title,
            description: input.description,
            severity: input.severity,
            ownerUserId: input.ownerUserId,
            reporterUserId: principal.userId,
            expectedResolutionAt: input.expectedResolutionAt ? new Date(input.expectedResolutionAt) : null,
            evidenceJson: JSON.stringify(input.evidence || []),
            historyJson: JSON.stringify([
              {
                action: 'CREATED',
                userId: principal.userId,
                timestamp: new Date().toISOString(),
              },
            ]),
          },
          include: {
            issueReason: true,
            reporterUser: true,
            ownerUser: true,
          },
        });

        if (input.severity === 'CRITICAL' || input.severity === 'HIGH') {
          await tx.task.update({
            where: { workspaceId_id: { workspaceId, id: task.id } },
            data: { status: 'BLOCKED', version: { increment: 1 } },
          });
        }

        await tx.workflowEvent.create({
          data: {
            workspaceId,
            instanceId: task.instanceId,
            taskId: task.id,
            fromStatus: task.status,
            toStatus: (input.severity === 'CRITICAL' || input.severity === 'HIGH') ? 'BLOCKED' : task.status,
            action: 'RECORD_ISSUE',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({ issueId: issue.id, severity: input.severity, title: input.title }),
          },
        });

        if (input.ownerUserId) {
          await new NotificationService(tx).sendNotification(workspaceId, {
            userId: input.ownerUserId,
            title: `Issue Assigned: ${input.title}`,
            body: `New ${input.severity} severity issue raised on task ${task.nodeKey}: ${input.title}`,
            subjectType: 'TASK_ISSUE',
            subjectId: issue.id,
            dedupeKey: `cmd:${createHash('sha256').update(commandKey).digest('hex')}:issue-owner:${input.ownerUserId}`,
          });
        }

        return {
          data: issue,
          aggregateType: 'TASK_ISSUE',
          aggregateId: issue.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Resolves a task issue and unblocks task if no other blocking issues remain.
   */
  async resolveTaskIssue(
    principal: Principal,
    issueId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input = ResolveTaskIssueSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'task.issue.resolve',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { issueId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const issue = await tx.taskIssue.findUnique({
          where: { workspaceId_id: { workspaceId, id: issueId } },
          include: { task: true },
        });
        if (!issue) throw new NotFoundError(`TaskIssue '${issueId}' not found`);

        if (issue.status === 'RESOLVED') {
          throw new BadRequestError('Issue is already resolved');
        }

        const history = JSON.parse(issue.historyJson || '[]');
        history.push({
          action: 'RESOLVED',
          userId: principal.userId,
          timestamp: new Date().toISOString(),
          notes: input.notes,
        });

        const updatedIssue = await tx.taskIssue.update({
          where: { workspaceId_id: { workspaceId, id: issueId } },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            historyJson: JSON.stringify(history),
          },
        });

        const otherOpenIssues = await tx.taskIssue.findMany({
          where: {
            workspaceId,
            taskId: issue.taskId,
            status: { in: ['OPEN', 'REOPENED'] },
            severity: { in: ['CRITICAL', 'HIGH'] },
            id: { not: issueId },
          },
        });

        if (otherOpenIssues.length === 0 && issue.task.status === 'BLOCKED') {
          const newStatus = issue.task.assignedTechnicianId ? 'ASSIGNED' : 'READY';
          await tx.task.update({
            where: { workspaceId_id: { workspaceId, id: issue.taskId } },
            data: { status: newStatus, version: { increment: 1 } },
          });
          await tx.workflowEvent.create({
            data: {
              workspaceId,
              instanceId: issue.task.instanceId,
              taskId: issue.taskId,
              fromStatus: 'BLOCKED',
              toStatus: newStatus,
              action: 'UNBLOCK',
              actorUserId: principal.userId,
              detailJson: JSON.stringify({ resolvedIssueId: issueId }),
            },
          });
        }

        return {
          data: updatedIssue,
          aggregateType: 'TASK_ISSUE',
          aggregateId: issue.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Reopens a resolved task issue.
   */
  async reopenTaskIssue(
    principal: Principal,
    issueId: string,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.write']);
    const input = ReopenTaskIssueSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'task.issue.reopen',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { issueId, ...input },
      prismaClient: this.db,
      handler: async (tx) => {
        const issue = await tx.taskIssue.findUnique({
          where: { workspaceId_id: { workspaceId, id: issueId } },
          include: { task: true },
        });
        if (!issue) throw new NotFoundError(`TaskIssue '${issueId}' not found`);

        if (issue.status !== 'RESOLVED') {
          throw new BadRequestError('Only resolved issues can be reopened');
        }

        const history = JSON.parse(issue.historyJson || '[]');
        history.push({
          action: 'REOPENED',
          userId: principal.userId,
          timestamp: new Date().toISOString(),
          notes: input.notes,
        });

        const updatedIssue = await tx.taskIssue.update({
          where: { workspaceId_id: { workspaceId, id: issueId } },
          data: {
            status: 'REOPENED',
            resolvedAt: null,
            historyJson: JSON.stringify(history),
          },
        });

        if (issue.severity === 'CRITICAL' || issue.severity === 'HIGH') {
          await tx.task.update({
            where: { workspaceId_id: { workspaceId, id: issue.taskId } },
            data: { status: 'BLOCKED', version: { increment: 1 } },
          });
        }

        return {
          data: updatedIssue,
          aggregateType: 'TASK_ISSUE',
          aggregateId: issue.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Lists all issues recorded for a given task.
   */
  async listTaskIssues(principal: Principal, taskId: string): Promise<TaskIssueDTO[]> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.read']);
    const workspaceId = principal.workspaceId;

    const issues = await this.db.taskIssue.findMany({
      where: { workspaceId, taskId },
      include: {
        issueReason: true,
        reporterUser: true,
        ownerUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return issues.map((i) => ({
      id: i.id,
      workspaceId: i.workspaceId,
      taskId: i.taskId,
      issueReasonId: i.issueReasonId,
      issueReasonCode: i.issueReason?.code,
      issueReasonLabel: i.issueReason?.label,
      title: i.title,
      description: i.description,
      status: i.status as any,
      severity: i.severity as any,
      ownerUserId: i.ownerUserId,
      ownerUserName: i.ownerUser?.name,
      reporterUserId: i.reporterUserId,
      reporterUserName: i.reporterUser?.name,
      expectedResolutionAt: i.expectedResolutionAt?.toISOString() || null,
      resolvedAt: i.resolvedAt?.toISOString() || null,
      evidence: JSON.parse(i.evidenceJson || '[]'),
      history: JSON.parse(i.historyJson || '[]'),
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }));
  }

  /**
   * Scans a QR or barcode string safely, re-authorizing against tenant and returning entity info.
   */
  async scanCode(principal: Principal, rawInput: unknown): Promise<ScanResultDTO> {
    requireAnyPermission(principal, ['task.execute_assigned', 'task.assign', 'planning.read', 'order.read']);
    const input = ScanCodeSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;
    const trimmed = input.code.trim();
    const canReadAllTasks = ['task.assign', 'planning.read', 'workspace.admin'].some((permission) =>
      hasPermission(principal, permission)
    );
    const canReadAssignedTasks = hasPermission(principal, 'task.execute_assigned') && !canReadAllTasks;
    // Order data (number, customer item, status) may only be scanned by principals
    // holding the same read permission the order detail endpoint enforces.
    const canReadOrders = hasPermission(principal, 'order.read');

    // 1. Task lookup
    const taskId = trimmed.startsWith('TASK:') ? trimmed.slice(5) : trimmed;
    const task = await this.db.task.findFirst({
      where: {
        workspaceId,
        id: taskId,
        ...(!canReadAllTasks
          ? canReadAssignedTasks && principal.technicianId
            ? { assignedTechnicianId: principal.technicianId }
            : { id: '__not_an_authorized_task__' }
          : {}),
      },
      include: {
        instance: {
          include: {
            order: true,
            workflowVersion: { include: { nodes: true } },
          },
        },
      },
    });
    if (task) {
      const node = task.instance.workflowVersion.nodes.find((n) => n.key === task.nodeKey);
      return {
        type: 'TASK',
        entityId: task.id,
        displayCode: task.nodeKey,
        title: node?.name || task.nodeKey,
        status: task.status,
        taskId: task.id,
      };
    }

    // 2. Order lookup
    const orderId = trimmed.startsWith('ORDER:') ? trimmed.slice(6) : trimmed;
    const order = canReadOrders ? await this.db.order.findFirst({
      where: {
        workspaceId,
        OR: [{ id: orderId }, { orderNumber: trimmed }],
      },
      include: { item: true },
    }) : null;
    if (order) {
      return {
        type: 'ORDER',
        entityId: order.id,
        displayCode: order.orderNumber,
        title: `Order ${order.orderNumber} (${order.item.name})`,
        status: order.status,
      };
    }

    // 3. Manufacturing order lookup
    const mo = await this.db.manufacturingOrder.findFirst({
      where: {
        workspaceId,
        OR: [{ id: trimmed }, { moNumber: trimmed }],
      },
    });
    if (mo) {
      // Only principals allowed to open tasks may receive a deep link target;
      // read-only order staff learn the job exists but never a task pointer.
      const canOpenTasks = canReadAllTasks || canReadAssignedTasks;
      const matchingTask = canOpenTasks ? await this.db.task.findFirst({
        where: {
          workspaceId,
          jobsheet: { manufacturingOrderId: mo.id },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...(canReadAssignedTasks
            ? principal.technicianId
              ? { assignedTechnicianId: principal.technicianId }
              : { id: '__not_an_authorized_task__' }
            : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }) : null;
      if (canReadAssignedTasks && !matchingTask) {
        throw new NotFoundError(`No operational entity found for code '${trimmed}'`);
      }
      return {
        type: 'JOB',
        entityId: mo.id,
        displayCode: mo.moNumber,
        title: `Job ${mo.moNumber}`,
        status: mo.status,
        ...(matchingTask ? { taskId: matchingTask.id } : {}),
      };
    }

    throw new NotFoundError(`No operational entity found for code '${trimmed}'`);
  }

  async getTechnicianProfile(principal: Principal): Promise<TechnicianProfileDTO> {
    const workspaceId = principal.workspaceId;
    let targetTechId = principal.technicianId;

    if (!targetTechId) {
      const membership = await this.db.membership.findFirst({
        where: { workspaceId, userId: principal.userId },
        select: { technicianId: true },
      });
      targetTechId = membership?.technicianId ?? null;
    }

    const technician = targetTechId
      ? await this.db.technician.findUnique({
          where: {
            workspaceId_id: {
              workspaceId,
              id: targetTechId,
            },
          },
          include: {
            department: true,
            calendar: true,
            facility: true,
            skills: {
              include: { skill: true },
              where: { revokedAt: null },
            },
            certifications: {
              include: { certification: true },
              where: { revokedAt: null },
            },
          },
        })
      : null;

    const facility = principal.facilityId
      ? await this.db.facility.findFirst({
          where: { workspaceId, id: principal.facilityId },
        })
      : null;

    return {
      technicianId: technician?.id ?? null,
      userId: principal.userId,
      name: principal.name || technician?.name || "Operator",
      email: principal.email,
      code: technician?.code ?? null,
      facilityId: technician?.facilityId ?? principal.facilityId ?? null,
      facilityName: technician?.facility?.name ?? facility?.name ?? null,
      departmentId: technician?.departmentId ?? null,
      departmentName: technician?.department?.name ?? null,
      calendarName: technician?.calendar?.name ?? null,
      roles: principal.roles,
      skills: (technician?.skills || []).map((s: { id: string; skillId: string; skill: { code: string; name: string }; level: number; assessmentStatus: string | null; validFrom: Date | null; expiresAt: Date | null; evidence: string | null }) => ({
        id: s.id,
        skillId: s.skillId,
        skillCode: s.skill.code,
        skillName: s.skill.name,
        level: s.level,
        assessmentStatus: s.assessmentStatus || "VERIFIED",
        validFrom: s.validFrom?.toISOString() ?? null,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        evidence: s.evidence,
      })),
      certifications: (technician?.certifications || []).map((c: { id: string; certificationId: string; certification: { code: string; name: string }; status: string | null; validFromDate: Date | null; expiresAtDate: Date | null; validUntil: string; scope: string | null }) => ({
        id: c.id,
        certificationId: c.certificationId,
        code: c.certification.code,
        name: c.certification.name,
        status: c.status || "ACTIVE",
        validFromDate: c.validFromDate?.toISOString() ?? null,
        expiresAtDate: c.expiresAtDate?.toISOString() ?? null,
        validUntil: c.validUntil,
        scope: c.scope,
      })),
    };
  }
}

import { db } from '@/server/db/client';
export const executionService = new ExecutionService(db);
