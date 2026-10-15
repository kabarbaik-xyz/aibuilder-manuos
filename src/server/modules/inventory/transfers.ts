import { Prisma } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { ForbiddenError } from '@/domain/errors';
import { hasPermission } from '@/server/auth/permissions';
import { postMovement } from './ledger';
import { StockTransferInput, StockTransferSchema, StockMovementDTO } from './contracts';

export async function transferStock(
  tx: Prisma.TransactionClient,
  principal: Principal,
  rawInput: StockTransferInput,
  commandId?: string
): Promise<StockMovementDTO> {
  if (!hasPermission(principal, 'inventory.transfer')) {
    throw new ForbiddenError('Missing inventory.transfer permission');
  }

  const input = StockTransferSchema.parse(rawInput);

  return postMovement(
    tx,
    principal,
    {
      movementType: 'TRANSFER',
      itemId: input.itemId,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      sourceLotId: input.sourceLotId ?? null,
      destinationLotId: input.destinationLotId ?? input.sourceLotId ?? null,
      atoms: input.atoms,
      referenceType: 'MANUAL',
      notes: input.notes,
    },
    commandId
  );
}
