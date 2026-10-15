import { PrismaClient } from '@prisma/client';

export async function findInspectionById(
  db: PrismaClient,
  workspaceId: string,
  id: string
) {
  return db.inspection.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id,
      },
    },
    include: {
      productionOutput: {
        include: {
          task: {
            include: {
              instance: {
                include: {
                  order: true,
                },
              },
            },
          },
          item: true,
          lot: true,
          destinationLocation: true,
        },
      },
      qcChecklist: {
        include: {
          checks: true,
        },
      },
      results: true,
      reworkAttempts: {
        include: {
          authorizedBy: true,
        },
      },
      reinspectionOf: true,
      reinspections: true,
      inspectorUser: true,
    },
  });
}

export async function listInspections(
  db: PrismaClient,
  workspaceId: string,
  filters?: {
    status?: string;
    productionOutputId?: string;
    sourceType?: string;
  }
) {
  const where: any = { workspaceId };
  if (filters?.status) where.status = filters.status;
  if (filters?.productionOutputId) where.productionOutputId = filters.productionOutputId;
  if (filters?.sourceType) where.sourceType = filters.sourceType;

  return db.inspection.findMany({
    where,
    include: {
      productionOutput: {
        include: {
          item: true,
          lot: true,
          task: true,
        },
      },
      qcChecklist: true,
      inspectorUser: true,
      results: true,
      reworkAttempts: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findDefaultLocationByKind(
  db: PrismaClient,
  workspaceId: string,
  kind: string
) {
  return db.location.findFirst({
    where: {
      workspaceId,
      kind,
      isActive: true,
      archivedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });
}
