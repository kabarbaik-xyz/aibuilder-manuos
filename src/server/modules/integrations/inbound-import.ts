import { PrismaClient, Prisma } from '@prisma/client';
import { db } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError } from '@/domain/errors';
import { OrderService } from '../orders/service';
import { SupplyService } from '../supply/service';
import { MastersService } from '../masters/service';
import { parseQuantity } from '@/domain/quantity';

export type ImportEntityType = 'ORDERS' | 'MATERIALS' | 'IDENTITIES';

export interface InboundImportRowError {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface InboundImportRequest {
  entityType: ImportEntityType;
  dryRun?: boolean;
  facilityId?: string;
  sourceMapping?: Record<string, string>;
  rows?: Record<string, unknown>[];
  csvText?: string;
  idempotencyPrefix?: string;
}

export interface InboundImportResultDTO {
  entityType: ImportEntityType;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedRows: number;
  errors: InboundImportRowError[];
  importedIds: string[];
}

export class InboundImportService {
  private readonly orderService: OrderService;
  private readonly supplyService: SupplyService;
  private readonly mastersService: MastersService;

  constructor(private readonly prisma: PrismaClient) {
    this.orderService = new OrderService(prisma);
    this.supplyService = new SupplyService(prisma);
    this.mastersService = new MastersService(prisma);
  }

  /**
   * Parses RFC-4180 style CSV text into raw row records.
   */
  static parseCsv(csvText: string): Record<string, string>[] {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = cols[j] ?? '';
      }
      rows.push(row);
    }

    return rows;
  }

  /**
   * Applies optional field name mapping (external column -> canonical field).
   */
  private applySourceMapping(
    rawRow: Record<string, unknown>,
    mapping?: Record<string, string>
  ): Record<string, unknown> {
    if (!mapping || Object.keys(mapping).length === 0) {
      return rawRow;
    }
    const mapped: Record<string, unknown> = { ...rawRow };
    for (const [sourceKey, targetKey] of Object.entries(mapping)) {
      if (rawRow[sourceKey] !== undefined) {
        mapped[targetKey] = rawRow[sourceKey];
      }
    }
    return mapped;
  }

  /**
   * Validates and optionally executes inbound CSV/JSON imports for orders, materials, or workforce identities.
   * Strictly enforces tenant/facility boundaries and rejects cross-tenant references per row.
   */
  async importRecords(
    principal: Principal,
    input: InboundImportRequest
  ): Promise<InboundImportResultDTO> {
    requireAnyPermission(principal, [
      'order.create',
      'inventory.write',
      'resource.manage',
      'access.manage',
      'owner',
    ]);

    const workspaceId = principal.workspaceId;
    const dryRun = Boolean(input.dryRun);
    const prefix = input.idempotencyPrefix || `imp-${workspaceId.slice(0, 8)}`;

    // Validate facility scope if provided
    if (input.facilityId) {
      const allowedFacilities = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
      if (allowedFacilities.length > 0 && !allowedFacilities.includes(input.facilityId)) {
        throw new BadRequestError(`Facility '${input.facilityId}' is outside principal authorized scope.`);
      }
      const fac = await this.prisma.facility.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.facilityId } },
      });
      if (!fac) {
        throw new BadRequestError(`Facility '${input.facilityId}' not found in workspace.`);
      }
    }

    const rawRows: Record<string, unknown>[] = input.csvText
      ? InboundImportService.parseCsv(input.csvText)
      : input.rows || [];

    if (rawRows.length === 0) {
      throw new BadRequestError('Import payload must contain at least one data row.');
    }

    const errors: InboundImportRowError[] = [];
    const importedIds: string[] = [];
    let validRows = 0;

    for (let idx = 0; idx < rawRows.length; idx++) {
      const rowNumber = idx + 1;
      const row = this.applySourceMapping(rawRows[idx], input.sourceMapping);

      try {
        if (input.entityType === 'ORDERS') {
          const customerCode = String(row.customerCode || '').trim();
          const itemCode = String(row.itemCode || '').trim();
          const orderTypeCode = String(row.orderTypeCode || '').trim();
          const quantityStr = String(row.orderedQuantity ?? '').trim();
          const requestedDate = String(row.requestedDate || '').trim();

          if (!customerCode) {
            errors.push({ rowNumber, field: 'customerCode', message: 'customerCode is required.' });
            continue;
          }
          if (!itemCode) {
            errors.push({ rowNumber, field: 'itemCode', message: 'itemCode is required.' });
            continue;
          }
          if (!quantityStr) {
            errors.push({ rowNumber, field: 'orderedQuantity', message: 'orderedQuantity is required.' });
            continue;
          }

          let atoms: bigint;
          try {
            atoms = parseQuantity(quantityStr);
            if (atoms <= 0n) {
              errors.push({ rowNumber, field: 'orderedQuantity', message: 'orderedQuantity must be positive.' });
              continue;
            }
          } catch (e: any) {
            errors.push({ rowNumber, field: 'orderedQuantity', message: e.message || 'Invalid quantity.' });
            continue;
          }

          const [customer, item, orderType] = await Promise.all([
            this.prisma.customer.findFirst({
              where: { workspaceId, code: customerCode, archivedAt: null },
            }),
            this.prisma.item.findFirst({
              where: { workspaceId, code: itemCode, archivedAt: null },
            }),
            orderTypeCode
              ? this.prisma.orderType.findFirst({
                  where: { workspaceId, code: orderTypeCode, archivedAt: null },
                })
              : this.prisma.orderType.findFirst({
                  where: { workspaceId, archivedAt: null },
                }),
          ]);

          if (!customer) {
            errors.push({
              rowNumber,
              field: 'customerCode',
              message: `Customer '${customerCode}' does not exist in workspace.`,
            });
            continue;
          }
          if (!item) {
            errors.push({
              rowNumber,
              field: 'itemCode',
              message: `Item '${itemCode}' does not exist in workspace.`,
            });
            continue;
          }
          if (!orderType) {
            errors.push({
              rowNumber,
              field: 'orderTypeCode',
              message: `OrderType '${orderTypeCode || 'DEFAULT'}' does not exist in workspace.`,
            });
            continue;
          }

          validRows++;
          if (!dryRun) {
            const created = await this.orderService.createOrderDraft(
              principal,
              {
                customerId: customer.id,
                orderTypeId: orderType.id,
                itemId: item.id,
                orderedQuantity: quantityStr,
                requestedDate: requestedDate || new Date(Date.now() + 7 * 86400000).toISOString(),
                facilityId: input.facilityId,
              },
              `${prefix}:order:${rowNumber}:${customerCode}:${itemCode}:${quantityStr}`
            );
            importedIds.push(created.data.id);
          }
        } else if (input.entityType === 'MATERIALS') {
          const code = String(row.code || '').trim();
          const name = String(row.name || '').trim();
          const itemType = String(row.itemType || 'RAW').trim().toUpperCase();
          const uomCode = String(row.uomCode || 'PCS').trim();

          if (!code || !name) {
            errors.push({ rowNumber, field: 'code', message: 'Material code and name are required.' });
            continue;
          }
          if (!['RAW', 'WIP', 'FG', 'CONSUMABLE'].includes(itemType)) {
            errors.push({ rowNumber, field: 'itemType', message: `Invalid itemType '${itemType}'.` });
            continue;
          }

          const uom = await this.prisma.uom.findFirst({
            where: { workspaceId, code: uomCode },
          });
          if (!uom) {
            errors.push({
              rowNumber,
              field: 'uomCode',
              message: `UOM '${uomCode}' does not exist in workspace.`,
            });
            continue;
          }

          validRows++;
          if (!dryRun) {
            const existing = await this.prisma.item.findUnique({
              where: { workspaceId_code: { workspaceId, code } },
            });
            if (existing) {
              importedIds.push(existing.id);
            } else {
              const created = await this.mastersService.createItem(
                principal,
                {
                  code,
                  name,
                  itemType: itemType as any,
                  baseUomId: uom.id,
                  tracking: 'LOT',
                },
                `${prefix}:item:${rowNumber}:${code}`
              );
              importedIds.push(created.data.id);
            }
          }
        } else if (input.entityType === 'IDENTITIES') {
          const code = String(row.code || row.employeeCode || '').trim();
          const name = String(row.name || '').trim();
          const departmentCode = String(row.departmentCode || '').trim();

          if (!code || !name) {
            errors.push({ rowNumber, field: 'code', message: 'Technician code and name are required.' });
            continue;
          }

          const dept = departmentCode
            ? await this.prisma.department.findFirst({
                where: { workspaceId, code: departmentCode, archivedAt: null },
              })
            : await this.prisma.department.findFirst({
                where: { workspaceId, archivedAt: null },
              });

          if (!dept) {
            errors.push({
              rowNumber,
              field: 'departmentCode',
              message: `Department '${departmentCode || 'DEFAULT'}' does not exist in workspace.`,
            });
            continue;
          }

          validRows++;
          if (!dryRun) {
            const existing = await this.prisma.technician.findUnique({
              where: { workspaceId_code: { workspaceId, code } },
            });
            if (existing) {
              importedIds.push(existing.id);
            } else {
              const created = await this.mastersService.createTechnician(
                principal,
                {
                  code,
                  name,
                  departmentId: dept.id,
                  facilityId: input.facilityId,
                },
                `${prefix}:tech:${rowNumber}:${code}`
              );
              importedIds.push(created.data.id);
            }
          }
        } else {
          throw new BadRequestError(`Unsupported import entityType: ${input.entityType}`);
        }
      } catch (err: any) {
        errors.push({
          rowNumber,
          message: err.message || 'Row validation failed',
        });
      }
    }

    return {
      entityType: input.entityType,
      dryRun,
      totalRows: rawRows.length,
      validRows,
      importedRows: dryRun ? 0 : importedIds.length,
      errors,
      importedIds,
    };
  }
}

export const inboundImportService = new InboundImportService(db);
