import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, ConflictError } from '@/domain/errors';

export interface InstantiateWorkflowParams {
  tx: any; // Prisma transaction client
  principal: Principal;
  order: any;
  publishedVersion: any;
  engineeringRevision: any;
  orderLine?: any;
  orderLineCount?: number;
  manufacturingOrder?: any;
  idempotencyKey: string;
}

export interface InstantiationResult {
  instanceId: string;
  moId: string;
  jobsheetId: string;
  taskIds: Record<string, string>; // nodeKey -> taskId
  demandIds: string[];
  orderLineId: string | null;
}

export async function instantiateWorkflow(
  params: InstantiateWorkflowParams
): Promise<InstantiationResult> {
  const {
    tx,
    principal,
    order,
    publishedVersion,
    engineeringRevision,
    orderLine,
    orderLineCount = 1,
    manufacturingOrder,
    idempotencyKey,
  } = params;

  // 1. Check if already instantiated
  const existingInstances = await tx.workflowInstance.findMany({
    where: {
      orderId: order.id,
      engineeringRevisionId: engineeringRevision.id,
      workspaceId: principal.workspaceId,
    },
    include: {
      tasks: { include: { jobsheet: true } },
      order: {
        include: {
          manufacturingOrders: true,
          demands: true,
        },
      },
    },
  });
  const existingInstance = existingInstances.find((candidate: any) =>
    manufacturingOrder
      ? candidate.tasks.some((task: any) => task.jobsheet?.manufacturingOrderId === manufacturingOrder.id)
      : true
  );

  if (existingInstance) {
    const taskIds: Record<string, string> = {};
    for (const t of existingInstance.tasks) {
      taskIds[t.nodeKey] = t.id;
    }
    const mo = existingInstance.order.manufacturingOrders.find((candidate: any) =>
      manufacturingOrder
        ? candidate.id === manufacturingOrder.id
        : candidate.orderLineId === (orderLine?.id ?? null)
    );
    const jobsheet = await tx.jobsheet.findFirst({
      where: {
        orderId: order.id,
        manufacturingOrderId: mo?.id,
        workspaceId: principal.workspaceId,
      },
    });
    const taskIdSet = new Set(existingInstance.tasks.map((task: any) => task.id));

    return {
      instanceId: existingInstance.id,
      moId: mo ? mo.id : '',
      jobsheetId: jobsheet ? jobsheet.id : '',
      taskIds,
      demandIds: existingInstance.order.demands
        .filter((demand: any) => demand.taskId && taskIdSet.has(demand.taskId))
        .map((demand: any) => demand.id),
      orderLineId: orderLine?.id ?? null,
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
  const baseMoNumber = `MO-${order.orderNumber.replace(/^ORD-/, '')}`;
  const moNumber = orderLineCount > 1
    ? `${baseMoNumber}-L${String(orderLine.lineNumber).padStart(2, '0')}`
    : baseMoNumber;
  const mo = manufacturingOrder
    ? await tx.manufacturingOrder.update({
        where: { id: manufacturingOrder.id },
        data: {
          status: 'RELEASED',
          workflowVersionId: publishedVersion.id,
          engineeringRevisionId: engineeringRevision.id,
        },
      })
    : await tx.manufacturingOrder.create({
        data: {
          workspaceId: principal.workspaceId,
          orderId: order.id,
          orderLineId: orderLine?.id ?? null,
          moNumber,
          status: 'RELEASED',
          targetAtoms: order.orderedAtoms,
          workflowVersionId: publishedVersion.id,
          engineeringRevisionId: engineeringRevision.id,
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
        targetAtoms: mo.targetAtoms,
      },
    });

    taskMap.set(node.key, task);
    taskIdRecord[node.key] = task.id;

    // Automatic bound form instance expansion (WFL-06)
    const nodeBindings = await tx.formBinding.findMany({
      where: {
        workspaceId: principal.workspaceId,
        context: 'WORKFLOW_NODE',
        workflowNodeKey: node.key,
        workflowVersionId: publishedVersion.id,
      },
    });
    for (const binding of nodeBindings) {
      await tx.formInstance.create({
        data: {
          workspaceId: principal.workspaceId,
          formVersionId: binding.formVersionId,
          formBindingId: binding.id,
          subjectType: 'TASK',
          subjectId: task.id,
          status: 'PENDING',
        },
      });
    }
  }

  // Automatic order-level bound form expansion (WFL-06)
  if (order.orderTypeId) {
    const orderBindings = await tx.formBinding.findMany({
      where: {
        workspaceId: principal.workspaceId,
        context: 'ORDER_TYPE',
        orderTypeId: order.orderTypeId,
      },
    });
    for (const binding of orderBindings) {
      const existing = await tx.formInstance.findFirst({
        where: {
          workspaceId: principal.workspaceId,
          subjectType: 'ORDER',
          subjectId: order.id,
          formVersionId: binding.formVersionId,
        },
      });
      if (!existing) {
        await tx.formInstance.create({
          data: {
            workspaceId: principal.workspaceId,
            formVersionId: binding.formVersionId,
            formBindingId: binding.id,
            subjectType: 'ORDER',
            subjectId: order.id,
            status: 'PENDING',
          },
        });
      }
    }
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

    // requirementAtoms = (manufacturingOrder.targetAtoms * bomLine.requirementAtoms) / bomLine.outputBasisAtoms
    const baseRequirement =
      (BigInt(mo.targetAtoms) * BigInt(bomLine.requirementAtoms)) /
      BigInt(bomLine.outputBasisAtoms || 1000000n);

    // Allowance calculation using authoritative integer basis points
    const allowanceBasis = BigInt(
      (bomLine as any).allowanceBps ?? Math.round((bomLine.allowancePercent || 0.0) * 100)
    );
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
  const currentOrder = await tx.order.findUnique({
    where: { workspaceId_id: { workspaceId: principal.workspaceId, id: order.id } },
    select: { status: true },
  });
  if (currentOrder?.status !== 'RELEASED' && currentOrder?.status !== 'IN_PRODUCTION') {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'RELEASED',
        version: { increment: 1 },
      },
    });
  }

  return {
    instanceId: instance.id,
    moId: mo.id,
    jobsheetId: jobsheet.id,
    taskIds: taskIdRecord,
    demandIds,
    orderLineId: orderLine?.id ?? null,
  };
}
