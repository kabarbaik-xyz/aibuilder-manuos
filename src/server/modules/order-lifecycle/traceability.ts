import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/domain/errors';
import { formatQuantity } from '@/domain/quantity';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { FormSubmissionService } from '@/server/modules/forms/submissions';

export interface OrderEvidenceEvent {
  reference: string;
  category: 'WORKFLOW' | 'ENGINEERING' | 'FORM' | 'SCHEDULING' | 'MATERIAL' | 'PRODUCTION' | 'QUALITY' | 'DELIVERY' | 'PASSPORT';
  title: string;
  label: string;
  summary: string;
  occurredAt: string;
  orderId: string;
  lineId?: string;
  jobId?: string;
  taskId?: string;
  stageId?: string;
  submissionId?: string;
  lotId?: string;
  shipmentId?: string;
  actorName?: string;
  href: string;
  references: string[];
}

export interface OrderEvidenceTimeline {
  orderId: string;
  orderNumber: string;
  events: OrderEvidenceEvent[];
  sampled: boolean;
  appliedSearch: string | null;
}

/**
 * Returns a bounded, read-only view of authoritative order evidence sources.
 * Customers use the separately permissioned passport projection; this internal
 * timeline never leaks workflow ownership, staff, or unpublished evidence.
 */
export async function getOrderEvidenceTimeline(
  db: PrismaClient,
  principal: Principal,
  orderId: string,
  options: { search?: string; limit?: number } = {},
): Promise<OrderEvidenceTimeline> {
  requireAnyPermission(principal, ['order.read', 'traceability.read', 'admin.access']);
  if (principal.customerId) throw new NotFoundError('Order evidence is not available.');
  const search = options.search?.trim().slice(0, 120) ?? '';
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const facilityIds = principal.facilityIds ?? (principal.facilityId ? [principal.facilityId] : []);
  const order = await db.order.findFirst({
    where: {
      id: orderId,
      workspaceId: principal.workspaceId,
      ...(principal.roles.includes('OWNER') ? {} : { facilityId: { in: facilityIds } }),
    },
    select: { id: true, orderNumber: true },
  });
  if (!order) throw new NotFoundError('Order evidence is not available.');

  const [lifecycleEvents, engineeringRevisions, shipments, instances, lifecycleInstance] = await Promise.all([
    db.orderLifecycleEvent.findMany({
      where: { workspaceId: principal.workspaceId, instance: { orderId } },
      include: { stage: { select: { id: true, name: true, department: { select: { name: true } } } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    }),
    db.engineeringRevision.findMany({
      where: { workspaceId: principal.workspaceId, orderId },
      select: { id: true, revisionNumber: true, status: true, approvedById: true, approvedAt: true, workflowVersionId: true, createdAt: true, updatedAt: true, orderLine: { select: { id: true, lineNumber: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50,
    }),
    db.shipment.findMany({
      where: { workspaceId: principal.workspaceId, orderId },
      include: { lines: { include: { item: { select: { code: true, name: true } }, lot: { select: { lotNumber: true } } } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50,
    }),
    db.workflowInstance.findMany({
      where: { workspaceId: principal.workspaceId, orderId },
      select: {
        id: true,
        workflowVersion: { select: { versionNumber: true, template: { select: { name: true } } } },
        tasks: { select: { id: true, nodeKey: true, attemptNumber: true, jobsheet: { select: { manufacturingOrder: { select: { id: true, moNumber: true, orderLineId: true } } } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50,
    }),
    db.orderLifecycleInstance.findFirst({
      where: { workspaceId: principal.workspaceId, orderId },
      include: {
        workflowVersion: { select: { versionNumber: true, template: { select: { name: true } } } },
        stages: { include: { department: { select: { name: true } }, assignedMembership: { select: { user: { select: { name: true } } } } } },
      },
    }),
  ]);

  const taskRows = instances.flatMap(instance => instance.tasks.map(task => ({ ...task, instanceId: instance.id })));
  const taskIds = taskRows.map(task => task.id);
  const taskById = new Map(taskRows.map(task => [task.id, task]));
  const actorIds = [...new Set([...lifecycleEvents.map(event => event.actorUserId), ...engineeringRevisions.flatMap(revision => revision.approvedById ? [revision.approvedById] : [])])];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorById = new Map(actors.map(actor => [actor.id, actor.name]));

  const events: OrderEvidenceEvent[] = lifecycleEvents.map((event) => {
    let detail: { action?: string; completionFact?: string; reason?: string } = {};
    try { detail = JSON.parse(event.detailJson) as typeof detail; } catch { /* Preserve a readable generic event for legacy malformed details. */ }
    const label = event.stage?.name ?? 'Order workflow';
    const action = detail.action?.replaceAll('_', ' ').toLowerCase();
    const fact = detail.completionFact?.replaceAll('_', ' ').toLowerCase();
    return {
      reference: `LIFECYCLE_EVENT:${event.id}`, category: 'WORKFLOW',
      title: event.eventType.replaceAll('_', ' ').toLowerCase(), label,
      summary: [action, fact, event.fromState && event.toState ? `${event.fromState.toLowerCase()} → ${event.toState.toLowerCase()}` : null].filter(Boolean).join(' · ') || `${event.stage?.department.name ?? 'Workflow'} handoff`,
      occurredAt: event.occurredAt.toISOString(), orderId, stageId: event.stageId ?? undefined,
      actorName: actorById.get(event.actorUserId) ?? 'Former user', href: `/orders/${encodeURIComponent(orderId)}#lifecycle`, references: [order.orderNumber],
    };
  });
  let sourceWasSampled = lifecycleEvents.length > limit || engineeringRevisions.length === 50 || shipments.length === 50 || instances.length === 50;
  if (lifecycleInstance) {
    const versionLabel = `${lifecycleInstance.workflowVersion.template.name} · v${lifecycleInstance.workflowVersion.versionNumber}`;
    const stageFormPins = lifecycleInstance.stages.flatMap(stage => {
      try { return (JSON.parse(stage.formPinsJson) as Array<{ formVersionId: string; contentHash: string; required: boolean }>).map(pin => ({ ...pin, stage })); }
      catch { return []; }
    });
    const pinnedFormIds = [...new Set(stageFormPins.map(pin => pin.formVersionId))];
    const pinnedFormVersions = pinnedFormIds.length ? await db.formVersion.findMany({
      where: { workspaceId: principal.workspaceId, id: { in: pinnedFormIds } },
      select: { id: true, contentHash: true, versionNumber: true, template: { select: { name: true } } },
    }) : [];
    const pinnedFormById = new Map(pinnedFormVersions.map(form => [form.id, form]));
    events.push({
      reference: `LIFECYCLE_PIN:${lifecycleInstance.id}`, category: 'WORKFLOW', title: 'Order workflow pinned',
      label: versionLabel, summary: `${lifecycleInstance.stages.length} stages pinned at intake; existing work keeps this version.`,
      occurredAt: lifecycleInstance.startedAt.toISOString(), orderId,
      href: `/orders/${encodeURIComponent(orderId)}#lifecycle`,
      references: [order.orderNumber, versionLabel, ...lifecycleInstance.stages.map(stage => stage.name)],
    });
    for (const stage of lifecycleInstance.stages) {
      const pinnedLabels = stageFormPins.filter(pin => pin.stage.id === stage.id).map(pin => {
        const form = pinnedFormById.get(pin.formVersionId);
        return form?.contentHash === pin.contentHash ? `${form.template.name} v${form.versionNumber}${pin.required ? ' required' : ' optional'}` : 'Historical form pin retained';
      });
      events.push({
        reference: `LIFECYCLE_STAGE_PIN:${stage.id}`, category: 'WORKFLOW', title: 'Stage configuration pinned',
        label: `${stage.name} · ${stage.department.name}`, summary: [`${stage.action.replaceAll('_', ' ').toLowerCase()} · ${stage.assignedMembership?.user.name ?? 'Department queue'} · ${stage.state.toLowerCase()}`, ...pinnedLabels].join(' · '),
        occurredAt: stage.createdAt.toISOString(), orderId, stageId: stage.id,
        actorName: stage.assignedMembership?.user.name,
        href: `/orders/${encodeURIComponent(orderId)}#lifecycle`,
        references: [order.orderNumber, stage.name, stage.department.name, versionLabel],
      });
    }
  }
  const routingVersionIds = [...new Set(engineeringRevisions.flatMap(revision => revision.workflowVersionId ? [revision.workflowVersionId] : []))];
  const routingVersions = routingVersionIds.length ? await db.workflowVersion.findMany({
    where: { workspaceId: principal.workspaceId, id: { in: routingVersionIds } },
    select: { id: true, versionNumber: true, template: { select: { name: true } } },
  }) : [];
  const routingVersionById = new Map(routingVersions.map(version => [version.id, `${version.template.name} · v${version.versionNumber}`]));
  for (const revision of engineeringRevisions) {
    const approved = revision.status === 'APPROVED' && revision.approvedAt;
    events.push({
      reference: `ENGINEERING_REVISION:${revision.id}`, category: 'ENGINEERING',
      title: approved ? 'Engineering approved' : `Engineering ${revision.status.toLowerCase()}`,
      label: `Revision ${revision.revisionNumber}${revision.orderLine ? ` · line ${revision.orderLine.lineNumber}` : ''}`,
      summary: [routingVersionById.get(revision.workflowVersionId ?? ''), approved ? `Approved ${revision.approvedAt!.toISOString()}` : `Revision updated ${revision.updatedAt.toISOString()}`].filter(Boolean).join(' · '),
      occurredAt: (approved ? revision.approvedAt! : revision.updatedAt).toISOString(), orderId,
      lineId: revision.orderLine?.id, actorName: revision.approvedById ? actorById.get(revision.approvedById) ?? 'Former user' : undefined,
      href: `/engineering/orders/${encodeURIComponent(orderId)}?revisionId=${encodeURIComponent(revision.id)}`,
      references: [order.orderNumber, `Revision ${revision.revisionNumber}`],
    });
  }
  for (const shipment of shipments) {
    const milestones = [
      { status: 'ALLOCATED', at: shipment.allocatedAt, title: 'Shipment allocated', quantity: 'allocatedAtoms' as const },
      ...(shipment.dispatchedAt ? [{ status: 'DISPATCHED', at: shipment.dispatchedAt, title: 'Shipment dispatched', quantity: 'dispatchedAtoms' as const }] : []),
      ...(shipment.deliveredAt ? [{ status: 'DELIVERED', at: shipment.deliveredAt, title: 'Shipment delivered', quantity: 'deliveredAtoms' as const }] : []),
    ];
    for (const milestone of milestones) {
      const quantityLabel = milestone.status.toLowerCase();
      const lineSummary = shipment.lines.map(line => `${line.item.code}: ${formatQuantity(line[milestone.quantity])} ${quantityLabel}`).join(', ');
      events.push({
        reference: `SHIPMENT:${shipment.id}:${milestone.status}`, category: 'DELIVERY',
        title: milestone.title, label: shipment.shipmentNumber,
        summary: [shipment.carrierName, shipment.trackingNumber, lineSummary].filter(Boolean).join(' · '),
        occurredAt: milestone.at.toISOString(), orderId, shipmentId: shipment.id,
        href: `/delivery/shipments/${encodeURIComponent(shipment.id)}`,
        references: [order.orderNumber, shipment.shipmentNumber, ...shipment.lines.flatMap(line => [line.item.code, ...(line.lot ? [line.lot.lotNumber] : [])])],
      });
    }
  }

  if (principal.permissions.has('planning.read') && taskIds.length) {
    const [workflowEvents, bookings] = await Promise.all([
      db.workflowEvent.findMany({
        where: { workspaceId: principal.workspaceId, taskId: { in: taskIds } },
        select: { id: true, taskId: true, action: true, fromStatus: true, toStatus: true, reason: true, actorUserId: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 200,
      }),
      db.resourceBooking.findMany({
        where: { workspaceId: principal.workspaceId, taskId: { in: taskIds } },
        select: { id: true, taskId: true, resourceType: true, resourceId: true, startAt: true, endAt: true, status: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 200,
      }),
    ]);
    sourceWasSampled ||= workflowEvents.length === 200 || bookings.length === 200;
    const workflowActorIds = [...new Set(workflowEvents.map(event => event.actorUserId))];
    const workflowActors = workflowActorIds.length ? await db.user.findMany({ where: { id: { in: workflowActorIds } }, select: { id: true, name: true } }) : [];
    const workflowActorById = new Map(workflowActors.map(actor => [actor.id, actor.name]));
    const resourceIds = [...new Set(bookings.map(booking => booking.resourceId))];
    const [machines, technicians] = await Promise.all([
      principal.permissions.has('planning.read') ? db.machine.findMany({ where: { workspaceId: principal.workspaceId, id: { in: resourceIds } }, select: { id: true, name: true, code: true } }) : [],
      principal.permissions.has('planning.read') ? db.technician.findMany({ where: { workspaceId: principal.workspaceId, id: { in: resourceIds } }, select: { id: true, name: true, code: true } }) : [],
    ]);
    const resources = new Map([...machines, ...technicians].map(resource => [resource.id, `${resource.name} (${resource.code})`]));
    for (const event of workflowEvents) {
      const task = taskById.get(event.taskId!);
      if (!task) continue;
      const mo = task.jobsheet?.manufacturingOrder;
      events.push({
        reference: `WORKFLOW_EVENT:${event.id}`, category: 'WORKFLOW', title: event.action.replaceAll('_', ' ').toLowerCase(),
        label: `${task.nodeKey} · attempt ${task.attemptNumber}`, summary: [event.fromStatus && `${event.fromStatus.toLowerCase()} → ${event.toStatus.toLowerCase()}`, event.reason].filter(Boolean).join(' · '),
        occurredAt: event.occurredAt.toISOString(), orderId, taskId: task.id, jobId: mo?.id,
        lineId: mo?.orderLineId ?? undefined, actorName: workflowActorById.get(event.actorUserId) ?? 'Former user',
        href: `/planning/tasks/${encodeURIComponent(task.id)}`, references: [order.orderNumber, task.nodeKey, ...(mo ? [mo.moNumber] : [])],
      });
    }
    for (const booking of bookings) {
      const task = taskById.get(booking.taskId);
      if (!task) continue;
      const mo = task.jobsheet?.manufacturingOrder;
      const when = booking.status === 'CONFIRMED' ? booking.startAt : booking.updatedAt;
      events.push({
        reference: `RESOURCE_BOOKING:${booking.id}:${booking.status}`, category: 'SCHEDULING',
        title: booking.status === 'CONFIRMED' ? 'Resource booked' : 'Booking cancelled',
        label: `${task.nodeKey} · ${resources.get(booking.resourceId) ?? booking.resourceType.toLowerCase()}`,
        summary: `${booking.startAt.toISOString()} – ${booking.endAt.toISOString()}`,
        occurredAt: when.toISOString(), orderId, taskId: task.id, jobId: mo?.id,
        lineId: mo?.orderLineId ?? undefined, href: `/planning/tasks/${encodeURIComponent(task.id)}`,
        references: [order.orderNumber, task.nodeKey, ...(mo ? [mo.moNumber] : [])],
      });
    }
  }

  if (principal.permissions.has('planning.read')) {
    const proposals = await db.recoveryProposal.findMany({
      where: { workspaceId: principal.workspaceId, orderId },
      select: { id: true, status: true, proposedById: true, resolvedById: true, resolutionNote: true, resolvedAt: true, createdAt: true, proposalJson: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50,
    });
    sourceWasSampled ||= proposals.length === 50;
    const proposalActorIds = [...new Set(proposals.flatMap(proposal => [proposal.proposedById, proposal.resolvedById].filter((id): id is string => Boolean(id))))];
    const proposalActors = proposalActorIds.length ? await db.user.findMany({ where: { id: { in: proposalActorIds } }, select: { id: true, name: true } }) : [];
    const proposalActorById = new Map(proposalActors.map(actor => [actor.id, actor.name]));
    for (const proposal of proposals) {
      let mode = 'Recovery review';
      try {
        const saved = JSON.parse(proposal.proposalJson) as { mode?: string };
        if (saved.mode === 'SCHEDULE_REVIEW') mode = 'Schedule review';
      } catch { /* Keep the safe generic label for malformed historical proposal data. */ }
      const resolved = proposal.status === 'APPROVED' && proposal.resolvedAt;
      events.push({
        reference: `RECOVERY_PROPOSAL:${proposal.id}:${proposal.status}`, category: 'SCHEDULING',
        title: proposal.status === 'APPROVED' ? 'Reviewed schedule applied' : proposal.status === 'REJECTED' ? 'Schedule review rejected' : 'Schedule review awaiting decision',
        label: mode,
        summary: proposal.resolutionNote ?? 'Proposal is a review only; no schedule change is recorded until the apply command succeeds.',
        occurredAt: (resolved ? proposal.resolvedAt! : proposal.createdAt).toISOString(), orderId,
        actorName: proposal.resolvedById ? proposalActorById.get(proposal.resolvedById) ?? 'Former user' : proposalActorById.get(proposal.proposedById ?? '') ?? undefined,
        href: `/ai/recovery/${encodeURIComponent(proposal.id)}`,
        references: [order.orderNumber, mode, proposal.status.toLowerCase()],
      });
    }
  }

  if (principal.permissions.has('forms.read')) {
    const inspections = taskIds.length
      ? await db.inspection.findMany({ where: { workspaceId: principal.workspaceId, productionOutput: { taskId: { in: taskIds } } }, select: { id: true } })
      : [];
    const formInstances = await db.formInstance.findMany({
      where: { workspaceId: principal.workspaceId, OR: [
        { subjectType: 'ORDER', subjectId: orderId },
        ...(taskIds.length ? [{ subjectType: 'TASK', subjectId: { in: taskIds } }] : []),
        ...(inspections.length ? [{ subjectType: 'INSPECTION', subjectId: { in: inspections.map(inspection => inspection.id) } }] : []),
      ] },
      select: { id: true, subjectType: true, subjectId: true },
      take: 100,
    });
    sourceWasSampled ||= formInstances.length === 100;
    // A workspace-level forms.read grant is not enough to expose every task or
    // inspection submission. Reuse the form domain's subject authorization.
    const formSubmissionService = new FormSubmissionService(db);
    const subjects = [...new Map(formInstances.map(instance => [`${instance.subjectType}:${instance.subjectId}`, {
      subjectType: instance.subjectType as 'ORDER' | 'TASK' | 'INSPECTION', subjectId: instance.subjectId,
    }])).values()];
    const readableInstances = (await Promise.all(subjects.map(subject =>
      formSubmissionService.listInstancesForSubject(principal, subject.subjectType, subject.subjectId)
    ))).flat();
    const readableInstanceIds = readableInstances.map(({ instance }) => instance.id);
    const readableInstanceById = new Map(formInstances.filter(instance => readableInstanceIds.includes(instance.id)).map(instance => [instance.id, instance]));
    const submissions = readableInstanceIds.length ? await db.formSubmission.findMany({
      where: { workspaceId: principal.workspaceId, instanceId: { in: readableInstanceIds }, status: 'FINAL' },
      select: { id: true, instanceId: true, sequenceNumber: true, actorId: true, finalizedAt: true, correctionReason: true, instance: { select: { formVersion: { select: { versionNumber: true, contentHash: true, template: { select: { name: true } } } } } } },
      orderBy: [{ finalizedAt: 'desc' }, { id: 'desc' }], take: 500,
    }) : [];
    sourceWasSampled ||= submissions.length === 500;
    const submissionActorIds = [...new Set(submissions.map(submission => submission.actorId))];
    const submissionActors = submissionActorIds.length ? await db.user.findMany({ where: { id: { in: submissionActorIds } }, select: { id: true, name: true } }) : [];
    const submissionActorById = new Map(submissionActors.map(actor => [actor.id, actor.name]));
    for (const submission of submissions) {
      const instance = readableInstanceById.get(submission.instanceId);
      if (!instance) continue;
      const task = taskById.get(instance.subjectId);
      const mo = task?.jobsheet?.manufacturingOrder;
      const subject = instance.subjectType === 'ORDER' ? 'Order specification' : instance.subjectType === 'TASK' ? task?.nodeKey ?? 'Task evidence' : 'Inspection evidence';
      events.push({
        reference: `FORM_SUBMISSION:${submission.id}`, category: 'FORM', title: submission.correctionReason ? 'Form evidence corrected' : 'Form evidence finalized',
        label: `${submission.instance.formVersion.template.name} v${submission.instance.formVersion.versionNumber} · ${subject} · submission ${submission.sequenceNumber}`,
        summary: submission.correctionReason ?? `Finalized ${submission.finalizedAt?.toISOString() ?? 'time unavailable'}`,
        occurredAt: (submission.finalizedAt ?? new Date(0)).toISOString(), orderId, taskId: task?.id, jobId: mo?.id,
        lineId: mo?.orderLineId ?? undefined, submissionId: submission.id,
        actorName: submissionActorById.get(submission.actorId) ?? 'Former user', href: instance.subjectType === 'TASK' && task ? `/planning/tasks/${encodeURIComponent(task.id)}` : `/orders/${encodeURIComponent(orderId)}#lifecycle`,
        references: [order.orderNumber, `${submission.instance.formVersion.template.name} v${submission.instance.formVersion.versionNumber}`, submission.instance.formVersion.contentHash.slice(0, 12), ...(task ? [task.nodeKey] : []), ...(mo ? [mo.moNumber] : [])],
      });
    }
  }

  const qcInspections = principal.permissions.has('quality.read') && taskIds.length
    ? await db.inspection.findMany({
        where: { workspaceId: principal.workspaceId, productionOutput: { taskId: { in: taskIds } } },
        include: { inspectorUser: { select: { name: true } }, productionOutput: { include: { task: { include: { jobsheet: { include: { manufacturingOrder: true } } } }, lot: true, item: true } }, reinspectionOf: { select: { id: true } }, reinspections: { select: { id: true, status: true } }, reworkAttempts: { select: { id: true, attemptNumber: true, status: true, targetAtoms: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 200,
      })
    : [];
  sourceWasSampled ||= qcInspections.length === 200;
  for (const inspection of qcInspections) {
    const task = inspection.productionOutput?.task;
    const mo = task?.jobsheet?.manufacturingOrder;
    events.push({
      reference: `QC_INSPECTION:${inspection.id}`, category: 'QUALITY',
      title: inspection.status === 'FINALIZED' ? `QC ${inspection.disposition?.toLowerCase() ?? 'finalized'}` : 'QC inspection opened',
      label: `${inspection.productionOutput?.item.code ?? 'Production output'} · ${task?.nodeKey ?? 'inspection'}${inspection.reinspectionOfId ? ' · reinspection' : ''}`,
      summary: `${formatQuantity(inspection.inspectedAtoms)} inspected · ${formatQuantity(inspection.passedAtoms)} passed · ${formatQuantity(inspection.reworkAtoms)} rework · ${formatQuantity(inspection.scrappedAtoms)} scrapped${inspection.reworkAttempts.length ? ` · ${inspection.reworkAttempts.length} rework attempt(s): ${inspection.reworkAttempts.map(attempt => `${formatQuantity(attempt.targetAtoms)} ${attempt.status.toLowerCase()}`).join(', ')}` : ''}`,
      occurredAt: (inspection.status === 'FINALIZED' ? inspection.updatedAt : inspection.createdAt).toISOString(), orderId,
      lineId: mo?.orderLineId ?? undefined, jobId: mo?.id, taskId: task?.id,
      lotId: inspection.productionOutput?.lotId ?? undefined,
      actorName: inspection.inspectorUser?.name ?? undefined,
      href: `/quality/inspections/${encodeURIComponent(inspection.id)}`,
      references: [order.orderNumber, ...(mo ? [mo.moNumber] : []), ...(task ? [task.nodeKey] : []), ...(inspection.productionOutput?.lot ? [inspection.productionOutput.lot.lotNumber] : [])],
    });
  }

  if (principal.permissions.has('inventory.read')) {
    const shipmentIds = shipments.map(shipment => shipment.id);
    const inspectionIds = qcInspections.map(inspection => inspection.id);
    const referenceFilters = [
      { referenceType: 'ORDER', referenceId: orderId },
      ...(taskIds.length ? [{ referenceType: 'TASK', referenceId: { in: taskIds } }] : []),
      ...(shipmentIds.length ? [{ referenceType: 'SHIPMENT', referenceId: { in: shipmentIds } }] : []),
      ...(inspectionIds.length ? [{ referenceType: 'QC_INSPECTION', referenceId: { in: inspectionIds } }] : []),
    ];
    const movements = await db.stockMovement.findMany({
      where: { workspaceId: principal.workspaceId, OR: referenceFilters },
      include: { actorUser: { select: { name: true } }, item: { select: { code: true, name: true } }, sourceLocation: { select: { name: true } }, destinationLocation: { select: { name: true } }, sourceLot: { select: { lotNumber: true } }, destinationLot: { select: { lotNumber: true } } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 200,
    });
    sourceWasSampled ||= movements.length === 200;
    for (const movement of movements) {
      const task = movement.referenceType === 'TASK' ? taskById.get(movement.referenceId ?? '') : undefined;
      const mo = task?.jobsheet?.manufacturingOrder;
      const shipmentId = movement.referenceType === 'SHIPMENT' ? movement.referenceId ?? undefined : undefined;
      const lot = movement.destinationLot?.lotNumber ?? movement.sourceLot?.lotNumber;
      events.push({
        reference: `STOCK_MOVEMENT:${movement.id}`, category: shipmentId ? 'DELIVERY' : 'MATERIAL',
        title: movement.movementType.replaceAll('_', ' ').toLowerCase(), label: `${movement.item.code} · ${movement.item.name}`,
        summary: `${formatQuantity(movement.atoms)} · ${movement.sourceLocation?.name ?? 'External'} → ${movement.destinationLocation?.name ?? 'External'}${lot ? ` · lot ${lot}` : ''}`,
        occurredAt: movement.occurredAt.toISOString(), orderId, taskId: task?.id, jobId: mo?.id,
        lineId: mo?.orderLineId ?? undefined, shipmentId, lotId: movement.destinationLotId ?? movement.sourceLotId ?? undefined,
        actorName: movement.actorUser.name,
        href: shipmentId ? `/delivery/shipments/${encodeURIComponent(shipmentId)}` : task ? `/planning/tasks/${encodeURIComponent(task.id)}` : `/orders/${encodeURIComponent(orderId)}#evidence`,
        references: [order.orderNumber, movement.item.code, ...(task ? [task.nodeKey] : []), ...(mo ? [mo.moNumber] : []), ...(lot ? [lot] : [])],
      });
    }
  }
  if (principal.permissions.has('traceability.read') || principal.permissions.has('quality.read') || principal.permissions.has('admin.access')) {
    const passports = await db.passport.findMany({
      where: { workspaceId: principal.workspaceId, orderId, status: 'RELEASED', snapshotJson: { not: null } },
      select: { id: true, serialNumber: true, publicationVersion: true, publishedAt: true, sharedCustomerId: true, shareRevokedAt: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 100,
    });
    sourceWasSampled ||= passports.length === 100;
    for (const passport of passports) {
      events.push({
        reference: `PASSPORT_PUBLICATION:${passport.id}:v${passport.publicationVersion}`, category: 'PASSPORT',
        title: 'Unit passport published', label: passport.serialNumber,
        summary: `Immutable passport snapshot v${passport.publicationVersion}${passport.sharedCustomerId && !passport.shareRevokedAt ? ' · shared with customer' : ''}`,
        occurredAt: (passport.publishedAt ?? new Date(0)).toISOString(), orderId,
        href: `/passports/${encodeURIComponent(passport.serialNumber)}`,
        references: [order.orderNumber, passport.serialNumber, `Passport v${passport.publicationVersion}`],
      });
    }
  }
  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.reference.localeCompare(b.reference));
  const matching = search
    ? events.filter(event => `${event.category} ${event.title} ${event.label} ${event.summary} ${event.references.join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    : events;
  return { orderId, orderNumber: order.orderNumber, events: matching.slice(0, limit), sampled: sourceWasSampled || matching.length > limit, appliedSearch: search || null };
}
