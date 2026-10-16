import { PrismaClient } from '@prisma/client';
import { db } from '@/server/db/client';
import { randomUUID } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import { CreateMaterialSubstituteSchema } from './change-contracts';

export class MaterialSubstituteService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Registers an approved material substitute.
   */
  async registerMaterialSubstitute(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['engineering.write', 'engineering.approve']);
    const input = CreateMaterialSubstituteSchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'material.substitute.create',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx) => {
        if (input.originalItemId === input.substituteItemId) {
          throw new BadRequestError('Substitute item cannot be identical to original item');
        }

        const orig = await tx.item.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.originalItemId } },
        });
        if (!orig) throw new NotFoundError(`Original item '${input.originalItemId}' not found`);

        const sub = await tx.item.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.substituteItemId } },
        });
        if (!sub) throw new NotFoundError(`Substitute item '${input.substituteItemId}' not found`);

        const substitute = await tx.materialSubstitute.create({
          data: {
            workspaceId,
            originalItemId: input.originalItemId,
            substituteItemId: input.substituteItemId,
            conversionRatio: input.conversionRatioAtoms,
            scope: input.scope,
            orderId: input.orderId,
            reason: input.reason,
            isActive: true,
            approvedByUserId: principal.userId,
          },
          include: {
            originalItem: true,
            substituteItem: true,
          },
        });

        return {
          data: substitute,
          aggregateType: 'MATERIAL_SUBSTITUTE',
          aggregateId: substitute.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Deactivates a material substitute.
   */
  async deactivateMaterialSubstitute(
    principal: Principal,
    substituteId: string,
    idempotencyKey?: string
  ) {
    requireAnyPermission(principal, ['engineering.write', 'engineering.approve']);
    const workspaceId = principal.workspaceId;

    return executeCommand({
      principal,
      commandType: 'material.substitute.deactivate',
      idempotencyKey: idempotencyKey || randomUUID(),
      payload: { substituteId },
      prismaClient: this.db,
      handler: async (tx) => {
        const sub = await tx.materialSubstitute.findUnique({
          where: { workspaceId_id: { workspaceId, id: substituteId } },
        });
        if (!sub) throw new NotFoundError(`Material substitute '${substituteId}' not found`);

        const updated = await tx.materialSubstitute.update({
          where: { workspaceId_id: { workspaceId, id: substituteId } },
          data: { isActive: false },
        });

        return {
          data: updated,
          aggregateType: 'MATERIAL_SUBSTITUTE',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }

  /**
   * Lists approved active substitutes for an item.
   */
  async listMaterialSubstitutes(principal: Principal, originalItemId?: string) {
    requireAnyPermission(principal, ['engineering.read', 'inventory.read', 'planning.read']);
    return this.db.materialSubstitute.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(originalItemId ? { originalItemId } : {}),
      },
      include: {
        originalItem: true,
        substituteItem: true,
      },
    });
  }
}

export const materialSubstituteService = new MaterialSubstituteService(db);
