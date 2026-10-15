import { Prisma } from '@prisma/client';
import { BadRequestError } from '@/domain/errors';

export interface AssertRequiredFormsInput {
  workspaceId: string;
  subjectType: 'ORDER' | 'TASK' | 'INSPECTION';
  subjectId: string;
}

/**
 * Validates that all required FormInstance records bound to this subject
 * have reached SUBMITTED (finalized) status.
 *
 * Runs inside an active Prisma transaction to ensure read consistency
 * with the domain state mutation.
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
      formBinding: true,
      formVersion: {
        include: {
          template: true,
        },
      },
    },
  });

  for (const inst of instances) {
    const isRequired = inst.formBinding ? inst.formBinding.required : true;
    if (isRequired && inst.status !== 'SUBMITTED') {
      const templateName = inst.formVersion?.template?.name || inst.formVersionId;
      throw new BadRequestError(
        `Required form '${templateName}' has not been finalized (status: ${inst.status}) for ${input.subjectType.toLowerCase()} '${input.subjectId}'.`
      );
    }
  }
}
