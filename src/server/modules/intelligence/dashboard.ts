import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';

export interface DashboardMetricDTO {
  activeOrdersCount: number;
  ordersDueThisWeekCount: number;
  atRiskOrdersCount: number;
  qcPassedUnits: number;
  reworkUnits: number;
  machineUtilizationPct: number;
  activeMachinesCount: number;
  materialShortagesCount: number;
  pendingApprovalsCount: number;
}

export interface DashboardOrderRowDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  orderedQty: number;
  completedQty: number;
  progressPct: number;
  status: string;
  promisedDate: string | null;
  priority: string;
}

export interface DashboardExceptionDTO {
  id: string;
  type: 'MATERIAL_SHORTAGE' | 'PENDING_APPROVAL' | 'QC_REWORK' | 'AT_RISK_ETA';
  title: string;
  description: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  referenceId: string;
  actionScreen: string;
}

export interface DashboardOverviewDTO {
  workspaceId: string;
  metrics: DashboardMetricDTO;
  orders: DashboardOrderRowDTO[];
  exceptions: DashboardExceptionDTO[];
  updatedAt: string;
}

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Aggregates authoritative factory operational metrics across orders,
   * inventory ledgers, QC inspections, and resource capacities.
   */
  async getDashboardOverview(principal: Principal): Promise<DashboardOverviewDTO> {
    requireAnyPermission(principal, [
      'order.read',
      'planning.read',
      'execution.read',
      'customer_order.read_own',
      'owner',
    ]);

    const workspaceId = principal.workspaceId;
    const effectiveCustomerId = principal.customerId || undefined;

    // 1. Fetch Orders
    const orders = await this.prisma.order.findMany({
      where: {
        workspaceId,
        ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
      },
      include: {
        customer: true,
        item: true,
        orderType: true,
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    productionOutputs: {
                      include: {
                        inspections: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        engineeringRevisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const activeOrders = orders.filter(
      (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
    );

    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let ordersDueThisWeekCount = 0;
    let atRiskOrdersCount = 0;
    let pendingApprovalsCount = 0;

    const orderRows: DashboardOrderRowDTO[] = [];
    const exceptions: DashboardExceptionDTO[] = [];

    let totalQcPassedAtoms = 0n;
    let totalReworkAtoms = 0n;

    for (const o of orders) {
      if (o.status !== 'DELIVERED' && o.status !== 'CANCELLED') {
        if (o.promisedDate && o.promisedDate <= oneWeekFromNow) {
          ordersDueThisWeekCount++;
        }

        // Check if engineering is pending approval
        const latestRev = o.engineeringRevisions[0];
        if (latestRev && latestRev.status === 'DRAFT') {
          pendingApprovalsCount++;
          exceptions.push({
            id: `ex-eng-${o.id}`,
            type: 'PENDING_APPROVAL',
            title: `Engineering review pending for ${o.orderNumber}`,
            description: `Order ${o.orderNumber} requires engineering approval before manufacturing release.`,
            severity: 'WARNING',
            referenceId: o.id,
            actionScreen: 'orchestrator',
          });
        }
      }

      // Compute completed units from inspection passed atoms
      let orderPassedAtoms = 0n;
      let orderReworkAtoms = 0n;

      for (const mo of o.manufacturingOrders) {
        for (const js of mo.jobsheets) {
          for (const task of js.tasks) {
            for (const out of task.productionOutputs) {
              for (const insp of out.inspections) {
                if (insp.status === 'FINALIZED') {
                  orderPassedAtoms += insp.passedAtoms;
                  orderReworkAtoms += insp.reworkAtoms;
                }
              }
            }
          }
        }
      }

      totalQcPassedAtoms += orderPassedAtoms;
      totalReworkAtoms += orderReworkAtoms;

      const orderedQty = Number(o.orderedAtoms / 1_000_000n);
      const completedQty = Number(orderPassedAtoms / 1_000_000n);
      const progressPct =
        orderedQty > 0 ? Math.min(100, Math.round((completedQty / orderedQty) * 100)) : 0;

      const isAtRisk =
        o.status === 'RELEASED' &&
        o.promisedDate &&
        o.promisedDate < now &&
        completedQty < orderedQty;

      if (isAtRisk) {
        atRiskOrdersCount++;
        exceptions.push({
          id: `ex-risk-${o.id}`,
          type: 'AT_RISK_ETA',
          title: `Order ${o.orderNumber} overdue commitment`,
          description: `Promised on ${o.promisedDate?.toISOString().slice(0, 10)}, only ${completedQty}/${orderedQty} units completed.`,
          severity: 'CRITICAL',
          referenceId: o.id,
          actionScreen: 'orchestrator',
        });
      }

      orderRows.push({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        itemCode: o.item.code,
        itemName: o.item.name,
        orderedQty,
        completedQty,
        progressPct,
        status: o.status,
        promisedDate: o.promisedDate ? o.promisedDate.toISOString().slice(0, 10) : null,
        priority: o.orderType?.name || 'NORMAL',
      });
    }

    // 2. Fetch Machines & Capacities
    const machines = await this.prisma.machine.findMany({
      where: { workspaceId, archivedAt: null },
      include: {
        tasks: {
          where: { status: { in: ['ASSIGNED', 'RUNNING'] } },
        },
      },
    });

    const activeMachinesCount = machines.filter((m) => m.status === 'AVAILABLE').length;

    let totalScheduledMinutes = 0;
    const standardWeeklyMinutes = 40 * 60; // 2400 mins capacity per machine
    for (const m of machines) {
      for (const t of m.tasks) {
        totalScheduledMinutes += t.plannedDurationMinutes;
      }
    }

    const totalCapacityMinutes = Math.max(1, machines.length * standardWeeklyMinutes);
    const machineUtilizationPct = Math.min(
      100,
      Math.round((totalScheduledMinutes / totalCapacityMinutes) * 100)
    );

    // 3. Fetch Material Shortages
    const openDemands = await this.prisma.materialDemand.findMany({
      where: {
        workspaceId,
        status: 'OPEN',
      },
      include: {
        item: true,
      },
    });

    let materialShortagesCount = 0;
    for (const dem of openDemands) {
      const stock = await this.prisma.stockBalance.findFirst({
        where: {
          workspaceId,
          itemId: dem.itemId,
          location: { kind: { in: ['RAW', 'INTERNAL'] } },
        },
      });

      const onHand = stock ? stock.onHandAtoms - stock.reservedAtoms : 0n;
      if (onHand < dem.requiredAtoms) {
        materialShortagesCount++;
        exceptions.push({
          id: `ex-shortage-${dem.id}`,
          type: 'MATERIAL_SHORTAGE',
          title: `Shortage: ${dem.item.code}`,
          description: `Demand for ${Number(dem.requiredAtoms / 1_000_000n)} units requires replenishment.`,
          severity: 'CRITICAL',
          referenceId: dem.id,
          actionScreen: 'workstation',
        });
      }
    }

    const metrics: DashboardMetricDTO = {
      activeOrdersCount: activeOrders.length,
      ordersDueThisWeekCount,
      atRiskOrdersCount,
      qcPassedUnits: Number(totalQcPassedAtoms / 1_000_000n),
      reworkUnits: Number(totalReworkAtoms / 1_000_000n),
      machineUtilizationPct,
      activeMachinesCount,
      materialShortagesCount,
      pendingApprovalsCount,
    };

    return {
      workspaceId,
      metrics,
      orders: orderRows,
      exceptions,
      updatedAt: new Date().toISOString(),
    };
  }
}
