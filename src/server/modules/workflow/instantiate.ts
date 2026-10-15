import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, ConflictError } from '@/domain/errors';

export interface InstantiateWorkflowParams {
  tx: any; // Prisma transaction client
  principal: Principal;
  order: any;
  publishedVersion: any;
  engineeringRevision: any;
  idempotencyKey: string;
}

export interface InstantiationResult {
  instanceId: string;
  moId: string;
  jobsheetId: string;
  taskIds: Record<string, string>; // nodeKey -> taskId
  demandIds: string[];
}

export async function instantiateWorkflow(
  params: InstantiateWorkflowParams
): Promise<InstantiationResult> {
  const { tx, principal, order, publishedVersion, engineeringRevision, idempotencyKey } = params;

  // 1. Check if already instantiated
  const existingInstance = await tx.workflowInstance.findFirst({
    where: { orderId: order.id, workspaceId: principal.workspaceId },
    include: {
      tasks: true,
      order: {
        include: {
          manufacturingOrders: true,
          demands: true,
        },
      },
    },
  });

  if (existingInstance) {
    const taskIds: Record<string, string> = {};
    for (const t of existingInstance.tasks) {
      taskIds[t.nodeKey] = t.id;
    }
    const mo = existingInstance.order.manufacturingOrders[0];
    const jobsheet = await tx.jobsheet.findFirst({
      where: { orderId: order.id, workspaceId: principal.workspaceId },
    });

    return {
      instanceId: existingInstance.id,
      moId: mo ? mo.id : '',
      jobsheetId: jobsheet ? jobsheet.id : '',
      taskIds,
      demandIds: existingInstance.order.demands.map((d: any) => d.id),
    };
  }

  // 2. Validate states
  if (publishedVersion.status !== 'PUBLISHED') {
    throw new BadRequestError(`Cannot instantiate workflow version in status '${publishedVersion.status}'. Must be PUBLISHED.`);
  }

  if (engineeringRevision.status !== 'APPROVED') {
    throw new BadRequestError(`Cannot release order with engineering revision in status '${engineeringRevision.status}'. Must be APPROVED.`);
  }

  // 3. Create WorkflowInstance
  const instance = await tx.workflowInstance.create({
    data: {
      workspaceId: principal.workspaceId,
      orderId: order.id,
      workflowVersionId: publishedVersion.id,
      engineeringRevisionId: engineeringRevision.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  // 4. Create Manufacturing Order
  const moNumber = `MO-${order.orderNumber.replace(/^ORD-/, '')}`;
  const mo = await tx.manufacturingOrder.create({
    data: {
      workspaceId: principal.workspaceId,
      orderId: order.id,
      moNumber,
      status: 'RELEASED',
      targetAtoms: order.orderedAtoms,
    },
  });

  // 5. Create Jobsheet
  const jobsheet = await tx.jobsheet.create({
    data: {
      workspaceId: principal.workspaceId,
      manufacturingOrderId: mo.id,
      orderId: order.id,
      name: `Production Routing for ${order.orderNumber}`,
      instructionRevision: engineeringRevision.revisionNumber,
    },
  });

  // 6. Identify root nodes (nodes with in-degree 0 in edge graph)
  const incomingEdgeNodes = new Set(publishedVersion.edges.map((e: any) => e.toNodeKey));
  const taskMap = new Map<string, any>();
  const taskIdRecord: Record<string, string> = {};

  for (const node of publishedVersion.nodes) {
    const isRoot = !incomingEdgeNodes.has(node.key);
    const initialStatus = isRoot ? 'READY' : 'PENDING';

    const task = await tx.task.create({
      data: {
        workspaceId: principal.workspaceId,
        instanceId: instance.id,
        jobsheetId: jobsheet.id,
        nodeKey: node.key,
        attemptNumber: 1,
        status: initialStatus,
        plannedDurationMinutes: node.plannedDurationMinutes,
        targetItemId: order.itemId,
        targetAtoms: order.orderedAtoms,
      },
    });

    taskMap.set(node.key, task);
    taskIdRecord[node.key] = task.id;
  }

  // 7. Create Task Dependencies
  for (const edge of publishedVersion.edges) {
    const pred = taskMap.get(edge.fromNodeKey);
    const succ = taskMap.get(edge.toNodeKey);
    if (pred && succ) {
      await tx.taskDependency.create({
        data: {
          workspaceId: principal.workspaceId,
          instanceId: instance.id,
          predecessorTaskId: pred.id,
          successorTaskId: succ.id,
          policy: 'FINISH_TO_START',
        },
      });
    }
  }

  // 8. Calculate and Create Material Demand from BOM lines
  const demandIds: string[] = [];
  for (const bomLine of engineeringRevision.bomLines || []) {
    const associatedTask = taskMap.get(bomLine.operationNodeKey);

    // requirementAtoms = (order.orderedAtoms * bomLine.requirementAtoms) / bomLine.outputBasisAtoms
    const baseRequirement =
      (BigInt(order.orderedAtoms) * BigInt(bomLine.requirementAtoms)) /
      BigInt(bomLine.outputBasisAtoms || 1000000n);

    // Allowance percentage calculation
    const allowancePercent = bomLine.allowancePercent || 0.0;
    const allowanceBasis = BigInt(Math.round(allowancePercent * 100)); // e.g. 5.0% -> 500
    const allowanceAtoms = (baseRequirement * allowanceBasis) / 10000n;
    const totalRequiredAtoms = baseRequirement + allowanceAtoms;

    const demand = await tx.materialDemand.create({
      data: {
        workspaceId: principal.workspaceId,
        orderId: order.id,
        taskId: associatedTask ? associatedTask.id : null,
        bomLineId: bomLine.id,
        itemId: bomLine.itemId,
        requiredAtoms: totalRequiredAtoms,
        needByDate: order.requestedDate,
        status: 'OPEN',
      },
    });

    demandIds.push(demand.id);
  }

  // 9. Create Workflow Event
  await tx.workflowEvent.create({
    data: {
      workspaceId: principal.workspaceId,
      instanceId: instance.id,
      fromStatus: null,
      toStatus: 'ACTIVE',
      action: 'order.release',
      actorUserId: principal.userId,
      commandId: idempotencyKey,
      attemptNumber: 1,
      detailJson: JSON.stringify({
        orderNumber: order.orderNumber,
        moNumber,
        workflowVersionId: publishedVersion.id,
        versionNumber: publishedVersion.versionNumber,
        tasksCreated: publishedVersion.nodes.length,
        demandsCreated: demandIds.length,
      }),
    },
  });

  // 10. Advance Order status to RELEASED
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'RELEASED',
      version: { increment: 1 },
    },
  });

  return {
    instanceId: instance.id,
    moId: mo.id,
    jobsheetId: jobsheet.id,
    taskIds: taskIdRecord,
    demandIds,
  };
}
