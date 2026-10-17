import { Prisma } from '@prisma/client';
import { BadRequestError } from '@/domain/errors';

export interface AssertRequiredFormsInput {
  workspaceId: string;
  subjectType: 'ORDER' | 'TASK' | 'INSPECTION';
  subjectId: string;
}

/**
 * Validates that all required FormInstance records pinned to this subject
 * have reached SUBMITTED (finalized) status.
 *
 * Runs inside an active Prisma transaction to ensure read consistency
 * with the domain state mutation.
 *
 * Requiredness is snapshotted onto the instance when the subject is created.
 * Later binding changes must not retroactively add requirements to running work.
 */
export async function assertRequiredFormsFinalized(
  tx: Prisma.TransactionClient,
  input: AssertRequiredFormsInput
): Promise<void> {
  const instances = await tx.formInstance.findMany({
    where: {
      workspaceId: input.workspaceId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    },
    include: {
      formVersion: { include: { template: true } },
    },
  });

  // Do not query current bindings here: the subject's requirements were captured
  // at materialization time and later authoring changes apply only to new work.
  for (const inst of instances) {
    if (inst.required && inst.status !== 'SUBMITTED') {
      const templateName = inst.formVersion?.template?.name || inst.formVersionId;
      throw new BadRequestError(
        `Required form '${templateName}' has not been finalized (status: ${inst.status}) for ${input.subjectType.toLowerCase()} '${input.subjectId}'.`
      );
    }
  }
}
