import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError } from '@/domain/errors';
import { InventoryRepository } from './repository';
import { postMovement, reconcileStock } from './ledger';
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
  StockReconciliationResult,
} from './contracts';

export class InventoryService {
  private readonly repo: InventoryRepository;

  constructor(private readonly db: PrismaClient) {
    this.repo = new InventoryRepository(db);
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
}

import { db } from '@/server/db/client';
export const inventoryService = new InventoryService(db);

