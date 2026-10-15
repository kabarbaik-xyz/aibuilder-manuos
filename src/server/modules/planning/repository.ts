import { PrismaClient } from '@prisma/client';

export class PlanningRepository {
  constructor(private readonly db: PrismaClient) {}

  async findTaskWithRequirements(workspaceId: string, taskId: string) {
    return this.db.task.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: taskId,
        },
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
            order: true,
          },
        },
        predecessorDeps: {
          include: {
            predecessor: true,
          },
        },
        successorDeps: true,
        assignedTechnician: true,
        assignedMachine: true,
        resourceBookings: {
          where: { status: 'CONFIRMED' },
        },
      },
    });
  }

  async findTasksForScheduling(
    workspaceId: string,
    filters?: { orderId?: string; instanceId?: string; taskIds?: string[] }
  ) {
    const where: any = { workspaceId };
    if (filters?.taskIds && filters.taskIds.length > 0) {
      where.id = { in: filters.taskIds };
    } else if (filters?.instanceId) {
      where.instanceId = filters.instanceId;
    } else if (filters?.orderId) {
      where.instance = { orderId: filters.orderId };
    } else {
      // Default to uncompleted tasks
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
    }

    return this.db.task.findMany({
      where,
      include: {
        instance: {
          include: {
            workflowVersion: {
              include: {
                nodes: true,
                edges: true,
              },
            },
            order: {
              include: {
                demands: true,
              },
            },
          },
        },
        predecessorDeps: true,
        assignedTechnician: true,
        assignedMachine: true,
        resourceBookings: {
          where: { status: 'CONFIRMED' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findTechnicians(workspaceId: string) {
    return this.db.technician.findMany({
      where: {
        workspaceId,
        isActive: true,
        archivedAt: null,
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
  }

  async findMachines(workspaceId: string) {
    return this.db.machine.findMany({
      where: {
        workspaceId,
        archivedAt: null,
      },
      include: {
        machineClass: true,
      },
    });
  }

  async findExistingBookings(workspaceId: string, resourceType?: 'TECHNICIAN' | 'MACHINE') {
    const where: any = { workspaceId, status: 'CONFIRMED' };
    if (resourceType) {
      where.resourceType = resourceType;
    }
    return this.db.resourceBooking.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async replaceBookingsForTask(
    tx: any,
    workspaceId: string,
    taskId: string,
    bookings: Array<{
      resourceType: 'TECHNICIAN' | 'MACHINE';
      resourceId: string;
      startAt: Date;
      endAt: Date;
    }>
  ) {
    // Cancel existing confirmed bookings for this task
    await tx.resourceBooking.updateMany({
      where: {
        workspaceId,
        taskId,
        status: 'CONFIRMED',
      },
      data: {
        status: 'CANCELLED',
      },
    });

    // Create new bookings
    const created = [];
    for (const b of bookings) {
      const record = await tx.resourceBooking.create({
        data: {
          workspaceId,
          taskId,
          resourceType: b.resourceType,
          resourceId: b.resourceId,
          startAt: b.startAt,
          endAt: b.endAt,
          status: 'CONFIRMED',
        },
      });
      created.push(record);
    }
    return created;
  }

  async updateTaskAssignment(
    tx: any,
    workspaceId: string,
    taskId: string,
    data: {
      assignedTechnicianId?: string | null;
      assignedMachineId?: string | null;
      status?: string;
    }
  ) {
    return tx.task.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id: taskId,
        },
      },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
  }
}
