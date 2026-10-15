import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError } from '@/domain/errors';
import { InventoryRepository } from './repository';
import { postMovement, reconcileStock } from './ledger';
import { ReservationService } from './reservations';
import { IssueService } from './issues';
import { ConsumptionService } from './consumption';
import { createStockCount, approveStockCount, listStockCounts, getStockCount } from './counts';
import { transferStock } from './transfers';
import { reverseMovement } from './reversals';
import {
  MovementType,
  MovementReferenceType,
  PostMovementInput,
  PostMovementSchema,
  PostOpeningBalanceInput,
  PostOpeningBalanceSchema,
  StockFilters,
  StockFilterSchema,
  StockBalanceDTO,
  StockCountDTO,
  StockMovementDTO,
  StockReconciliationResult,
} from './contracts';

export class InventoryService {
  private readonly repo: InventoryRepository;
  private readonly reservationService: ReservationService;
  private readonly issueService: IssueService;
  private readonly consumptionService: ConsumptionService;

  constructor(private readonly db: PrismaClient) {
    this.repo = new InventoryRepository(db);
    this.reservationService = new ReservationService(db);
    this.issueService = new IssueService(db);
    this.consumptionService = new ConsumptionService(db);
  }

  async postOpeningBalance(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requirePermission(principal, 'inventory.opening');
    const input: PostOpeningBalanceInput = PostOpeningBalanceSchema.parse(rawInput);

    return executeCommand({
      principal,
      commandType: 'inventory.post_opening_balance',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        let lotId: string | undefined = undefined;

        if (input.lotNumber) {
          let lot = await tx.lot.findUnique({
            where: {
              workspaceId_itemId_lotNumber: {
                workspaceId: principal.workspaceId,
                itemId: input.itemId,
                lotNumber: input.lotNumber,
              },
            },
          });

          if (!lot) {
            lot = await tx.lot.create({
              data: {
                workspaceId: principal.workspaceId,
                itemId: input.itemId,
                lotNumber: input.lotNumber,
                supplierLotNumber: input.supplierLotNumber,
                expirationDate: input.expirationDate ? new Date(input.expirationDate) : undefined,
                notes: input.notes,
              },
            });
          }
          lotId = lot.id;
        }

        const movement = await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.OPENING_BALANCE,
            itemId: input.itemId,
            destinationLocationId: input.locationId,
            destinationLotId: lotId,
            atoms: input.atoms,
            referenceType: MovementReferenceType.OPENING,
            referenceId: requestId,
            notes: input.notes,
          },
          requestId
        );

        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async postMovement(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    const input: PostMovementInput = PostMovementSchema.parse(rawInput);

    // Permission enforcement based on movement type
    switch (input.movementType) {
      case MovementType.OPENING_BALANCE:
        requirePermission(principal, 'inventory.opening');
        break;
      case MovementType.PURCHASE_RECEIPT:
        requirePermission(principal, 'inventory.receive');
        break;
      case MovementType.TRANSFER:
        requirePermission(principal, 'inventory.transfer');
        break;
      case MovementType.ISSUE_TO_WIP:
      case MovementType.RETURN_FROM_WIP:
        requirePermission(principal, 'inventory.issue');
        break;
      case MovementType.PRODUCTION_CONSUME:
        requirePermission(principal, 'inventory.consume_assigned');
        break;
      case MovementType.QC_DISPOSITION:
        requirePermission(principal, 'quality.inspect');
        break;
      case MovementType.ADJUSTMENT:
        requirePermission(principal, 'inventory.adjust_approve');
        break;
      case MovementType.SHIPMENT:
        requirePermission(principal, 'delivery.dispatch');
        break;
      default:
        requirePermission(principal, 'inventory.transfer');
    }

    return executeCommand({
      principal,
      commandType: `inventory.${input.movementType.toLowerCase()}`,
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const movement = await postMovement(tx, principal, input, requestId);
        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async getBalances(
    principal: Principal,
    rawFilters: unknown
  ): Promise<StockBalanceDTO[]> {
    requirePermission(principal, 'inventory.read');
    const filters = StockFilterSchema.parse(rawFilters);
    return this.repo.listBalances(principal, filters);
  }

  async getMovements(
    principal: Principal,
    options: { itemId?: string; locationId?: string; limit?: number } = {}
  ) {
    requirePermission(principal, 'inventory.read');
    return this.repo.listMovements(principal, options);
  }

  async reconcile(principal: Principal): Promise<StockReconciliationResult> {
    requirePermission(principal, 'inventory.read');
    return reconcileStock(this.db, principal.workspaceId);
  }

  // -------------------------------------------------------------
  // O03 Operations
  // -------------------------------------------------------------

  async reserveStock(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return this.reservationService.reserveStock(principal, rawInput, idempotencyKey);
  }

  async releaseReservation(principal: Principal, reservationId: string, idempotencyKey?: string) {
    return this.reservationService.releaseReservation(principal, reservationId, idempotencyKey);
  }

  async listReservations(
    principal: Principal,
    filters: { demandId?: string; orderId?: string; taskId?: string; status?: string } = {}
  ) {
    return this.reservationService.listReservations(principal, filters);
  }

  async issueToProduction(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return this.issueService.issueToProduction(principal, rawInput, idempotencyKey);
  }

  async returnUnusedMaterial(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return this.issueService.returnUnusedMaterial(principal, rawInput, idempotencyKey);
  }

  async consumeIssuedMaterial(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return this.consumptionService.consumeIssuedMaterial(principal, rawInput, idempotencyKey);
  }

  async getTaskMaterialReadiness(principal: Principal, taskId: string) {
    requirePermission(principal, 'inventory.read');
    return this.consumptionService.getTaskMaterialReadiness(principal, taskId);
  }

  // -------------------------------------------------------------
  // O04 Operations (Stock Counts, Transfers & Reversals)
  // -------------------------------------------------------------

  async createStockCount(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return executeCommand<any, StockCountDTO>({
      principal,
      commandType: 'inventory.create_stock_count',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: rawInput as any,
      prismaClient: this.db,
      handler: async (tx) => {
        const count = await createStockCount(tx, principal, rawInput as any);
        return {
          data: count,
          aggregateType: 'STOCK_COUNT',
          aggregateId: count.id,
          resourceVersion: count.version,
        };
      },
    });
  }

  async approveStockCount(principal: Principal, countId: string, idempotencyKey?: string) {
    return executeCommand<{ countId: string }, StockCountDTO>({
      principal,
      commandType: 'inventory.approve_stock_count',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { countId },
      prismaClient: this.db,
      handler: async (tx) => {
        const count = await approveStockCount(tx, principal, countId);
        return {
          data: count,
          aggregateType: 'STOCK_COUNT',
          aggregateId: count.id,
          resourceVersion: count.version,
        };
      },
    });
  }

  async listStockCounts(principal: Principal) {
    return listStockCounts(this.db, principal);
  }

  async getStockCount(principal: Principal, countId: string) {
    return getStockCount(this.db, principal, countId);
  }

  async transferStock(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return executeCommand<any, StockMovementDTO>({
      principal,
      commandType: 'inventory.transfer_stock',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: rawInput as any,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const movement = await transferStock(tx, principal, rawInput as any, requestId);
        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async reverseMovement(principal: Principal, rawInput: unknown, idempotencyKey?: string) {
    return executeCommand<any, StockMovementDTO>({
      principal,
      commandType: 'inventory.reverse_movement',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: rawInput as any,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        const movement = await reverseMovement(tx, principal, rawInput as any, requestId);
        return {
          data: movement,
          aggregateType: 'STOCK_MOVEMENT',
          aggregateId: movement.id,
          resourceVersion: 1,
        };
      },
    });
  }
}

import { db } from '@/server/db/client';
export const inventoryService = new InventoryService(db);


