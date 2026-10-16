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
 *
 * Mandatory Form Evidence Invariant (WFL-04):
 * An absent FormInstance cannot bypass a required FormBinding.
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

  // Verify that any required FormBinding for this subject has a materialized FormInstance
  if (input.subjectType === 'ORDER') {
    const order = await tx.order.findFirst({
      where: { id: input.subjectId, workspaceId: input.workspaceId },
    });
    if (order?.orderTypeId) {
      const requiredBindings = await tx.formBinding.findMany({
        where: {
          workspaceId: input.workspaceId,
          context: 'ORDER_TYPE',
          orderTypeId: order.orderTypeId,
          required: true,
        },
        include: {
          formVersion: { include: { template: true } },
        },
      });
      for (const b of requiredBindings) {
        const inst = instances.find(
          (i) => i.formVersionId === b.formVersionId || i.formBindingId === b.id
        );
        if (!inst) {
          const templateName = b.formVersion?.template?.name || b.formVersionId;
          throw new BadRequestError(
            `Required form '${templateName}' has not been instantiated for order '${input.subjectId}'.`
          );
        }
      }
    }
  } else if (input.subjectType === 'TASK') {
    const task = await tx.task.findFirst({
      where: { id: input.subjectId, workspaceId: input.workspaceId },
      include: { instance: true },
    });
    if (task) {
      const requiredBindings = await tx.formBinding.findMany({
        where: {
          workspaceId: input.workspaceId,
          context: 'WORKFLOW_NODE',
          workflowNodeKey: task.nodeKey,
          ...(task.instance?.workflowVersionId ? { workflowVersionId: task.instance.workflowVersionId } : {}),
          required: true,
        },
        include: {
          formVersion: { include: { template: true } },
        },
      });
      for (const b of requiredBindings) {
        const inst = instances.find(
          (i) => i.formVersionId === b.formVersionId || i.formBindingId === b.id
        );
        if (!inst) {
          const templateName = b.formVersion?.template?.name || b.formVersionId;
          throw new BadRequestError(
            `Required form '${templateName}' has not been instantiated for task '${input.subjectId}'.`
          );
        }
      }
    }
  } else if (input.subjectType === 'INSPECTION') {
    const inspection = await tx.inspection.findFirst({
      where: { id: input.subjectId, workspaceId: input.workspaceId },
    });
    if (inspection?.qcChecklistId) {
      const requiredBindings = await tx.formBinding.findMany({
        where: {
          workspaceId: input.workspaceId,
          context: 'QC_CHECKLIST',
          qcChecklistId: inspection.qcChecklistId,
          required: true,
        },
        include: {
          formVersion: { include: { template: true } },
        },
      });
      for (const b of requiredBindings) {
        const inst = instances.find(
          (i) => i.formVersionId === b.formVersionId || i.formBindingId === b.id
        );
        if (!inst) {
          const templateName = b.formVersion?.template?.name || b.formVersionId;
          throw new BadRequestError(
            `Required form '${templateName}' has not been instantiated for inspection '${input.subjectId}'.`
          );
        }
      }
    }
  }

  // Ensure all existing instances marked required (or bound to required) are finalized
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
