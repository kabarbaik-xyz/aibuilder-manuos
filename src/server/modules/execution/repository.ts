import { PrismaClient } from '@prisma/client';
import type { Principal } from '@/server/auth/principal';
import { executionTaskScope } from './scope';

export class ExecutionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findTaskWithExecutionDetails(principal: Principal, taskId: string) {
    return this.db.task.findFirst({
      where: {
        ...executionTaskScope(principal),
        id: taskId,
      },
      include: {
        instance: {
          include: {
            workflowVersion: {
              include: {
                nodes: true,
                edges: true,
              },
            },
            engineeringRevision: { include: { drawingRevision: { include: { document: true } } } },
            order: {
              include: {
                customer: true,
                item: true,
                demands: {
                  include: {
                    item: true,
                    reservations: {
                      where: { status: 'ACTIVE' },
                    },
                  },
                },
              },
            },
          },
        },
        jobsheet: true,
        assignedTechnician: true,
        assignedMachine: true,
        predecessorDeps: {
          include: {
            predecessor: true,
          },
        },
        workSessions: {
          include: {
            technician: true,
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
  }

  async findActiveSession(workspaceId: string, taskId: string) {
    return this.db.workSession.findFirst({
      where: {
        workspaceId,
        taskId,
        endedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      include: {
        technician: true,
      },
    });
  }

  async createWorkSession(
    tx: any,
    data: {
      workspaceId: string;
      taskId: string;
      technicianId: string;
      sessionType: 'RUNNING' | 'PAUSED';
      startedAt: Date;
      notes?: string;
    }
  ) {
    return tx.workSession.create({
      data: {
        workspaceId: data.workspaceId,
        taskId: data.taskId,
        technicianId: data.technicianId,
        sessionType: data.sessionType,
        startedAt: data.startedAt,
        notes: data.notes,
      },
    });
  }

  async closeWorkSession(
    tx: any,
    workspaceId: string,
    sessionId: string,
    data: {
      endedAt: Date;
      durationMinutes: number;
    }
  ) {
    return tx.workSession.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id: sessionId,
        },
      },
      data: {
        endedAt: data.endedAt,
        durationMinutes: data.durationMinutes,
        version: { increment: 1 },
      },
    });
  }

  async listTasksForExecution(
    workspaceId: string,
    technicianId?: string | null,
    isSupervisor: boolean = false,
    facilityIds?: string[]
  ) {
    if (!isSupervisor && !technicianId) return [];
    const where: any = {
      workspaceId,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    };

    if (facilityIds) {
      where.instance = {
        is: { order: { is: { facilityId: { in: facilityIds } } } },
      };
    }

    if (technicianId && !isSupervisor) {
      where.assignedTechnicianId = technicianId;
    }

    return this.db.task.findMany({
      where,
      include: {
        instance: {
          include: {
            workflowVersion: {
              include: { nodes: true },
            },
            order: {
              include: {
                customer: true,
                item: true,
              },
            },
          },
        },
        assignedTechnician: true,
        assignedMachine: true,
        predecessorDeps: {
          include: { predecessor: true },
        },
        workSessions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }
}
