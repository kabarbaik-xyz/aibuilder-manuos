import { Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { ForbiddenError, NotFoundError, BadRequestError } from '@/domain/errors';
import { hasPermission } from '@/server/auth/permissions';
import { postMovement } from './ledger';
import { ReverseMovementInput, ReverseMovementSchema, StockMovementDTO, getBucketKey } from './contracts';

export async function reverseMovement(
  tx: Prisma.TransactionClient,
  principal: Principal,
  rawInput: ReverseMovementInput,
  commandId?: string
): Promise<StockMovementDTO> {
  if (!hasPermission(principal, 'inventory.reverse')) {
    throw new ForbiddenError(
      'Segregation of duties: only authorized roles (inventory.reverse) can reverse stock movements'
    );
  }

  const input = ReverseMovementSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  const original = await tx.stockMovement.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: input.movementId,
      },
    },
  });

  if (!original) {
    throw new NotFoundError(`Stock movement '${input.movementId}' not found`);
  }

  if (original.referenceType === 'REVERSAL') {
    throw new BadRequestError('Cannot reverse a movement that is already a reversal');
  }

  // Check if already reversed
  const existingReversal = await tx.stockMovement.findFirst({
    where: {
      workspaceId,
      referenceType: 'REVERSAL',
      referenceId: original.id,
    },
  });

  if (existingReversal) {
    throw new BadRequestError(`Movement '${original.id}' has already been reversed`);
  }

  // Check whether destination stock was already consumed / reduced
  if (original.destinationLocationId) {
    const destBucketKey = getBucketKey(
      original.itemId,
      original.destinationLocationId,
      original.destinationLotId
    );
    const balance = await tx.stockBalance.findUnique({
      where: {
        workspaceId_bucketKey: {
          workspaceId,
          bucketKey: destBucketKey,
        },
      },
    });

    const onHand = balance?.onHandAtoms ?? 0n;
    if (onHand < original.atoms) {
      throw new BadRequestError(
        `Cannot reverse movement '${original.id}': stock has already been consumed, transferred, or shipped. Available on-hand: ${onHand} atoms, required: ${original.atoms} atoms.`
      );
    }
  }

  // Post linked reversing movement with swapped source and destination
  return postMovement(
    tx,
    principal,
    {
      movementType: 'ADJUSTMENT',
      itemId: original.itemId,
      sourceLocationId: original.destinationLocationId,
      sourceLotId: original.destinationLotId,
      destinationLocationId: original.sourceLocationId,
      destinationLotId: original.sourceLotId,
      atoms: original.atoms,
      referenceType: 'REVERSAL',
      referenceId: original.id,
      notes: `Reversal of movement ${original.id}: ${input.reason}`,
    },
    commandId
  );
}
