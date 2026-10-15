import { PrismaClient } from '@prisma/client';

export async function findShipmentById(
  db: PrismaClient,
  workspaceId: string,
  id: string
) {
  return db.shipment.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id,
      },
    },
    include: {
      order: {
        include: {
          customer: true,
          item: true,
        },
      },
      customer: true,
      lines: {
        include: {
          item: true,
          lot: true,
          sourceLocation: true,
        },
      },
    },
  });
}

export async function listShipments(
  db: PrismaClient,
  workspaceId: string,
  filters?: {
    orderId?: string;
    customerId?: string;
    status?: string;
  }
) {
  const where: any = { workspaceId };
  if (filters?.orderId) where.orderId = filters.orderId;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.status) where.status = filters.status;

  return db.shipment.findMany({
    where,
    include: {
      order: {
        include: {
          customer: true,
          item: true,
        },
      },
      customer: true,
      lines: {
        include: {
          item: true,
          lot: true,
          sourceLocation: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getNextShipmentNumber(
  db: PrismaClient,
  workspaceId: string
): Promise<string> {
  const count = await db.shipment.count({
    where: { workspaceId },
  });
  const year = new Date().getFullYear();
  return `SH-${year}-${String(count + 1).padStart(4, '0')}`;
}
