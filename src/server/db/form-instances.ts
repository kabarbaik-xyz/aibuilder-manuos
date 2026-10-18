import type { PrismaClient } from '@prisma/client';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface FormInstanceSeed {
  workspaceId: string;
  formVersionId: string;
  formBindingId?: string | null;
  subjectType: string;
  subjectId: string;
  required: boolean;
  completionPoint: string;
  status?: string;
}

/**
 * Create form instances, skipping any whose natural key already exists.
 *
 * Prisma's SQLite connector rejects `createMany({ skipDuplicates: true })`, which
 * previously crashed fresh seeding and QC checklist inspections on SQLite. This
 * helper replicates the intended ON CONFLICT DO NOTHING semantics for the
 * FormInstance natural key `(workspaceId, subjectType, subjectId, formVersionId)`
 * by de-duplicating the batch and filtering rows that already exist.
 */
export async function createFormInstancesIfMissing(tx: TransactionClient, seeds: FormInstanceSeed[]): Promise<void> {
  if (seeds.length === 0) return;

  const keyOf = (row: { workspaceId: string; subjectType: string; subjectId: string; formVersionId: string }) =>
    `${row.workspaceId}|${row.subjectType}|${row.subjectId}|${row.formVersionId}`;

  const deduped = new Map<string, FormInstanceSeed>();
  for (const seed of seeds) deduped.set(keyOf(seed), seed);
  const candidates = [...deduped.values()];

  const existing = await tx.formInstance.findMany({
    where: {
      OR: candidates.map((seed) => ({
        workspaceId: seed.workspaceId,
        subjectType: seed.subjectType,
        subjectId: seed.subjectId,
        formVersionId: seed.formVersionId,
      })),
    },
    select: { workspaceId: true, subjectType: true, subjectId: true, formVersionId: true },
  });
  const existingKeys = new Set(existing.map((row) => keyOf(row)));

  const missing = candidates.filter((seed) => !existingKeys.has(keyOf(seed)));
  if (missing.length === 0) return;

  await tx.formInstance.createMany({ data: missing });
}
