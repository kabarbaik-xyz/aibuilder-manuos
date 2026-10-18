import { ConflictError, BadRequestError } from '@/domain/errors';
import { evaluateStageTransition, type LifecycleStageState } from '@/domain/order-lifecycle-runtime';
import type { LifecycleAction } from '@/domain/order-lifecycle-definition';

type Tx = any;

export async function assertLifecycleActionReady(
  tx: Tx,
  input: { workspaceId: string; orderId: string; action: LifecycleAction; stageId?: string; expectedStageVersion?: number }
) {
  const instance = await tx.orderLifecycleInstance.findFirst({
    where: { workspaceId: input.workspaceId, orderId: input.orderId, status: 'ACTIVE' },
    include: { stages: true },
  });
  if (!instance) return null;
  const matchingStages = instance.stages.filter((candidate: any) => candidate.action === input.action && (!input.stageId || candidate.id === input.stageId));
  if (matchingStages.length === 0) return null;
  const stage = matchingStages.find((candidate: any) => ['READY', 'ACTIVE'].includes(candidate.state));
  if (!stage) {
    const nextStage = instance.stages.find((candidate: any) => candidate.state === 'READY');
    throw new BadRequestError(nextStage
      ? `The selected order lifecycle requires '${nextStage.name}' before this action.`
      : `No ready '${input.action}' stage exists for this order.`);
  }
  if (input.expectedStageVersion !== undefined && stage.version !== input.expectedStageVersion) {
    throw new ConflictError('Lifecycle stage changed; refresh and try again.');
  }
  return { instance, stage };
}

export async function completeLifecycleAction(
  tx: Tx,
  input: { workspaceId: string; orderId: string; action: LifecycleAction; actorUserId: string; commandId: string; stageId?: string; expectedStageVersion?: number }
) {
  const ready = await assertLifecycleActionReady(tx, input);
  if (!ready) return;

  const { instance, stage } = ready;
  const assignment = JSON.parse(stage.assignmentJson) as
    | { kind: 'MEMBER'; membershipId: string }
    | { kind: 'DEPARTMENT_QUEUE'; departmentId: string; eligibleRoleCodes: string[] };
  const actorMembership = await tx.membership.findFirst({
    where: { workspaceId: input.workspaceId, userId: input.actorUserId, status: 'ACTIVE' },
    include: { roles: { include: { role: { select: { code: true, isActive: true } } } } },
  });
  const actorRoleCodes = (actorMembership?.roles ?? [])
    .filter((membershipRole: any) => membershipRole.role.isActive)
    .map((membershipRole: any) => membershipRole.role.code);
  const isAssignedActor = actorMembership && (!stage.assignedMembershipId || stage.assignedMembershipId === actorMembership.id) && (assignment.kind === 'MEMBER'
    ? actorMembership.id === assignment.membershipId
    : actorMembership.departmentId === assignment.departmentId
      && assignment.eligibleRoleCodes.some((roleCode) => actorRoleCodes.includes(roleCode)));
  if (!isAssignedActor) {
    throw new BadRequestError(`Only the assigned person or eligible department queue can complete stage '${stage.name}'.`);
  }

  const formPins = JSON.parse(stage.formPinsJson) as Array<{ formVersionId: string; contentHash: string; required: boolean }>;
  for (const pin of formPins.filter((form) => form.required)) {
    const version = await tx.formVersion.findFirst({
      where: { id: pin.formVersionId, workspaceId: input.workspaceId, contentHash: pin.contentHash },
      select: { template: { select: { purpose: true } } },
    });
    const purpose = version?.template.purpose;
    let subjects: Array<{ subjectType: string; subjectId: string }> = [];
    if (purpose === 'ORDER_SPEC') {
      subjects = [{ subjectType: 'ORDER', subjectId: input.orderId }];
    } else if (purpose === 'TASK_EVIDENCE') {
      const tasks = await tx.task.findMany({ where: { workspaceId: input.workspaceId, instance: { orderId: input.orderId } }, select: { id: true } });
      subjects = tasks.map((task: { id: string }) => ({ subjectType: 'TASK', subjectId: task.id }));
    } else if (purpose === 'QC_EVIDENCE') {
      const inspections = await tx.inspection.findMany({
        where: { workspaceId: input.workspaceId, productionOutput: { task: { instance: { orderId: input.orderId } } } },
        select: { id: true },
      });
      subjects = inspections.map((inspection: { id: string }) => ({ subjectType: 'INSPECTION', subjectId: inspection.id }));
    }
    const incomplete = subjects.length === 0 || await Promise.all(subjects.map(async (subject) => {
      const formInstance = await tx.formInstance.findFirst({
        where: { workspaceId: input.workspaceId, ...subject, formVersionId: pin.formVersionId },
        select: { status: true },
      });
      return formInstance?.status !== 'SUBMITTED';
    })).then((results: boolean[]) => results.some(Boolean));
    if (incomplete) {
      throw new BadRequestError(`Required form for stage '${stage.name}' must be submitted before this action.`);
    }
  }

  const snapshots = instance.stages.map((candidate: any) => ({
    key: candidate.stageKey,
    state: candidate.state as LifecycleStageState,
    predecessors: JSON.parse(candidate.predecessorKeysJson) as string[],
    activationCondition: JSON.parse(candidate.activationConditionJson ?? 'null') ?? undefined,
  }));
  const conditionFacts: Record<string, Record<string, unknown>> = {};
  for (const candidate of snapshots) {
    const condition = candidate.activationCondition;
    if (!condition || conditionFacts[condition.sourceStageKey]?.[condition.fieldKey] !== undefined) continue;
    const source = instance.stages.find((item: any) => item.stageKey === condition.sourceStageKey);
    const pinnedForms = source ? JSON.parse(source.formPinsJson) as Array<{ formVersionId: string }> : [];
    if (!pinnedForms.some((form) => form.formVersionId === condition.formVersionId)) continue;
    const formInstances = await tx.formInstance.findMany({
      where: {
        workspaceId: input.workspaceId,
        subjectType: 'ORDER',
        subjectId: input.orderId,
        formVersionId: condition.formVersionId,
        status: 'SUBMITTED',
      },
      include: { submissions: { where: { status: 'FINAL' }, orderBy: { sequenceNumber: 'desc' }, take: 1 } },
    });
    // A route may use only one finalized order-spec answer set. Ambiguity or
    // absent evidence stays missing and the deterministic evaluator fails closed.
    if (formInstances.length !== 1 || !formInstances[0].submissions[0]) continue;
    conditionFacts[condition.sourceStageKey] = JSON.parse(formInstances[0].submissions[0].answersJson) as Record<string, unknown>;
  }
  const decision = evaluateStageTransition(snapshots, { stageKey: stage.stageKey, outcome: 'COMPLETE', conditionFacts });
  if (!decision.allowed) throw new ConflictError(`Lifecycle stage cannot complete: ${decision.reason ?? 'invalid transition'}.`);

  for (const change of decision.changes) {
    const current = instance.stages.find((candidate: any) => candidate.stageKey === change.stageKey);
    if (!current || current.state === change.state) continue;
    const changedAt = new Date();
    const schedule = JSON.parse(current.scheduleJson) as { kind: 'DEADLINE'; dueAfterMinutes: number } | { kind: 'RESOURCE_CAPACITY' };
    const updated = await tx.orderLifecycleStage.updateMany({
      where: { workspaceId: input.workspaceId, id: current.id, version: current.version, state: current.state },
      data: {
        state: change.state,
        version: { increment: 1 },
        ...(change.state === 'COMPLETED' ? { startedAt: current.startedAt ?? changedAt, completedAt: changedAt } : {}),
        ...(change.state === 'READY' ? { dueAt: schedule.kind === 'DEADLINE' ? new Date(changedAt.getTime() + schedule.dueAfterMinutes * 60_000) : null } : {}),
      },
    });
    if (updated.count !== 1) throw new ConflictError('Lifecycle stage changed concurrently; reload the order and retry.');
    await tx.orderLifecycleEvent.create({
      data: {
        workspaceId: input.workspaceId,
        instanceId: instance.id,
        stageId: current.id,
        eventType: change.state === 'COMPLETED' ? 'STAGE_COMPLETED' : change.state === 'SKIPPED' ? 'STAGE_SKIPPED' : 'STAGE_READY',
        fromState: current.state,
        toState: change.state,
        actorUserId: input.actorUserId,
        commandId: input.commandId,
        detailJson: JSON.stringify({ action: input.action }),
      },
    });
  }

  const projectedStates = new Map(instance.stages.map((candidate: any) => [candidate.stageKey, candidate.state]));
  for (const change of decision.changes) projectedStates.set(change.stageKey, change.state);
  const unfinished = instance.stages.filter((candidate: any) => !['COMPLETED', 'SKIPPED'].includes(projectedStates.get(candidate.stageKey) ?? candidate.state));
  if (unfinished.length === 0) {
    await tx.orderLifecycleInstance.updateMany({
      where: { workspaceId: input.workspaceId, id: instance.id, version: instance.version, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
    });
  }
}
