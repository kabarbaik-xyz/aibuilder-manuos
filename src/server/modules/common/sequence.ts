import { PrismaClient, Prisma } from '@prisma/client';

export async function nextNumberSequence(
  client: PrismaClient | Prisma.TransactionClient,
  workspaceId: string,
  kind: string,
  prefix: string
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await client.numberSequence.upsert({
    where: {
      workspaceId_kind_year: {
        workspaceId,
        kind,
        year,
      },
    },
    update: {
      nextValue: { increment: 1 },
    },
    create: {
      workspaceId,
      kind,
      year,
      nextValue: 2,
    },
  });

  const currentVal = seq.nextValue === 2 ? 1 : seq.nextValue - 1;
  return `${prefix}-${year}-${String(currentVal).padStart(4, '0')}`;
}
