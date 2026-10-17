import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Principal } from '@/server/auth/principal';
import { NotFoundError } from '@/domain/errors';
import { DashboardService, DashboardExceptionDTO } from './dashboard';
import { db } from '@/server/db/client';
import { formatQuantity } from '@/domain/quantity';

const RiskFiltersSchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  type: z.enum(['MATERIAL_SHORTAGE', 'PENDING_APPROVAL', 'QC_REWORK', 'AT_RISK_ETA']).optional(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).optional(),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().refine(value => [10, 25, 50].includes(value)).default(10),
});

export type RiskFilters = z.input<typeof RiskFiltersSchema>;

export interface RiskListDTO {
  items: DashboardExceptionDTO[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  coverage: {
    complete: false;
    orderDerivedLimit: number;
    note: string;
  };
  updatedAt: string;
}

export interface RiskDetailDTO {
  risk: DashboardExceptionDTO;
  observedAt: string;
  source: { type: 'ORDER' | 'MATERIAL_DEMAND'; id: string; href: string; label: string };
  coverageNote: string;
  cause: string;
  affectedRecords: Array<{ type: 'ORDER' | 'TASK' | 'MATERIAL_DEMAND'; id: string; label: string; href: string }>;
  evidence: Array<{ label: string; value: string | null }>;
  missingData: string[];
  permittedActions: Array<{ label: string; href: string }>;
}

const dashboardOrderLimit = 50;
const coverageNote = `Order-derived exceptions are currently evaluated for the ${dashboardOrderLimit} most recently created workspace orders. Material shortage exceptions are evaluated from open material demands. This derived inbox has no acknowledge or resolve mutation.`;

export class RisksService {
  private readonly dashboard: DashboardService;

  constructor(private readonly prisma: PrismaClient) {
    this.dashboard = new DashboardService(prisma);
  }

  async list(principal: Principal, rawFilters: RiskFilters): Promise<RiskListDTO> {
    const filters = RiskFiltersSchema.parse(rawFilters);
    const overview = await this.dashboard.getDashboardOverview(principal);
    const needle = filters.search.toLocaleLowerCase();
    const filtered = overview.exceptions.filter((risk) =>
      !(principal.customerId && risk.type === 'MATERIAL_SHORTAGE') &&
      (!filters.type || risk.type === filters.type) &&
      (!filters.severity || risk.severity === filters.severity) &&
      (!needle || [risk.title, risk.description, risk.type, risk.referenceId]
        .some(value => value.toLocaleLowerCase().includes(needle)))
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;

    return {
      items: filtered.slice(start, start + filters.pageSize),
      pagination: { page, pageSize: filters.pageSize, total: filtered.length, totalPages },
      coverage: { complete: false, orderDerivedLimit: dashboardOrderLimit, note: coverageNote },
      updatedAt: overview.updatedAt,
    };
  }

  async get(principal: Principal, id: string): Promise<RiskDetailDTO> {
    const overview = await this.dashboard.getDashboardOverview(principal);
    const risk = overview.exceptions.find(item => item.id === id);
    if (!risk || (principal.customerId && risk.type === 'MATERIAL_SHORTAGE')) throw new NotFoundError(`Risk '${id}' not found in the current dashboard scope`);

    const isMaterial = risk.type === 'MATERIAL_SHORTAGE';
    const affectedRecords: RiskDetailDTO['affectedRecords'] = [];
    const evidence: RiskDetailDTO['evidence'] = [];
    const missingData: string[] = [];
    let cause = risk.description;
    let permittedActions: RiskDetailDTO['permittedActions'] = [];
    let source: RiskDetailDTO['source'] = isMaterial
      ? { type: 'MATERIAL_DEMAND', id: risk.referenceId, href: '/inventory', label: 'Open inventory' }
      : { type: 'ORDER', id: risk.referenceId, href: `/orders/${encodeURIComponent(risk.referenceId)}`, label: 'Open order' };

    if (isMaterial) {
      const demand = await this.prisma.materialDemand.findFirst({
        where: { workspaceId: principal.workspaceId, id: risk.referenceId },
        include: { item: true, order: true, task: true },
      });
      if (demand) {
        const balances = await this.prisma.stockBalance.findMany({
          where: { workspaceId: principal.workspaceId, itemId: demand.itemId, location: { kind: { in: ['RAW', 'INTERNAL'] } } },
        });
        const availableAtoms = balances.reduce((sum, balance) => sum + (balance.onHandAtoms - balance.reservedAtoms), 0n);
        const shortageAtoms = demand.requiredAtoms > availableAtoms ? demand.requiredAtoms - availableAtoms : 0n;
        cause = `Material ${demand.item.code} requires ${formatQuantity(demand.requiredAtoms)} units; ${formatQuantity(availableAtoms)} units are available after reservations.`;
        evidence.push(
          { label: 'Demand status', value: demand.status },
          { label: 'Required quantity', value: formatQuantity(demand.requiredAtoms) },
          { label: 'Available quantity', value: balances.length ? formatQuantity(availableAtoms) : null },
          { label: 'Current shortage', value: formatQuantity(shortageAtoms) },
          { label: 'Need-by date', value: demand.needByDate?.toISOString().slice(0, 10) ?? null },
        );
        if (!balances.length) missingData.push('No eligible RAW or INTERNAL stock balance rows were found for this material.');
        const orderHref = `/orders/${encodeURIComponent(demand.orderId)}`;
        affectedRecords.push({ type: 'MATERIAL_DEMAND', id: demand.id, label: `Demand for ${demand.item.code}`, href: '/inventory' });
        affectedRecords.push({ type: 'ORDER', id: demand.orderId, label: demand.order.orderNumber, href: orderHref });
        if (demand.task) affectedRecords.push({ type: 'TASK', id: demand.task.id, label: demand.task.nodeKey, href: `/planning/tasks/${encodeURIComponent(demand.task.id)}` });
        permittedActions = [{ label: 'Review affected order', href: orderHref }];
        if (principal.permissions.has('inventory.read')) permittedActions.push({ label: 'Review inventory', href: '/inventory' });
        source = { type: 'MATERIAL_DEMAND', id: demand.id, href: '/inventory', label: 'Open inventory' };
      } else {
        missingData.push('The material demand is no longer in the current workspace scope.');
      }
    } else {
      const order = await this.prisma.order.findFirst({
        where: { workspaceId: principal.workspaceId, id: risk.referenceId, ...(principal.customerId ? { customerId: principal.customerId } : {}) },
        include: { engineeringRevisions: { orderBy: { revisionNumber: 'desc' }, take: 1 }, manufacturingOrders: { include: { jobsheets: { include: { tasks: { include: { productionOutputs: { include: { inspections: true } } } } } } } } },
      });
      if (order) {
        const orderHref = `/orders/${encodeURIComponent(order.id)}`;
        affectedRecords.push({ type: 'ORDER', id: order.id, label: order.orderNumber, href: orderHref });
        if (risk.type === 'PENDING_APPROVAL') {
          const revision = order.engineeringRevisions[0];
          cause = revision ? `Engineering revision ${revision.revisionNumber} awaits engineering approval before release.` : 'The order needs an approved engineering revision before release.';
          evidence.push({ label: 'Order status', value: order.status }, { label: 'Engineering status', value: revision?.status ?? null }, { label: 'Promised date', value: order.promisedDate?.toISOString().slice(0, 10) ?? null });
          if (!revision) missingData.push('No engineering revision is attached to this order.');
          permittedActions = [{ label: 'Review order', href: orderHref }];
        } else if (risk.type === 'AT_RISK_ETA') {
          let passedAtoms = 0n;
          let hasInspectionEvidence = false;
          for (const mo of order.manufacturingOrders) for (const sheet of mo.jobsheets) for (const task of sheet.tasks) for (const output of task.productionOutputs) for (const inspection of output.inspections) {
            if (inspection.status === 'FINALIZED' && !inspection.reinspectionOfId) { passedAtoms += inspection.passedAtoms; hasInspectionEvidence = true; }
          }
          cause = `Promised ${order.promisedDate?.toISOString().slice(0, 10) ?? 'date unavailable'}; finalized QC evidence records ${formatQuantity(passedAtoms)} of ${formatQuantity(order.orderedAtoms)} units passed.`;
          evidence.push({ label: 'Order status', value: order.status }, { label: 'Promised date', value: order.promisedDate?.toISOString().slice(0, 10) ?? null }, { label: 'QC-passed quantity', value: hasInspectionEvidence ? formatQuantity(passedAtoms) : null }, { label: 'Ordered quantity', value: formatQuantity(order.orderedAtoms) });
          if (!hasInspectionEvidence) missingData.push('No finalized first-pass inspection evidence is available for this order.');
          permittedActions = [{ label: 'Review order', href: orderHref }];
        } else {
          evidence.push({ label: 'Order status', value: order.status });
          permittedActions = [{ label: 'Review order', href: orderHref }];
        }
      } else {
        missingData.push('The source order is no longer in the current workspace scope.');
      }
    }

    return {
      risk,
      observedAt: overview.updatedAt,
      source,
      coverageNote,
      cause,
      affectedRecords,
      evidence,
      missingData,
      permittedActions,
    };
  }
}

export const risksService = new RisksService(db);
