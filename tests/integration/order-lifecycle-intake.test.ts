import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { listLifecycleDepartmentMembers, listLifecycleWorkItems } from '@/server/modules/order-lifecycle/queries';
import { claimLifecycleStage, completeEvidenceReviewStage, reassignLifecycleStage } from '@/server/modules/order-lifecycle/assignments';
import { FormService } from '@/server/modules/forms/service';
import { FormSubmissionService } from '@/server/modules/forms/submissions';

describe('order lifecycle intake', () => {
  let fixture: FactoryFixture;
  let workflowService: WorkflowService;
  let orderService: OrderService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    workflowService = new WorkflowService(fixture.db);
    orderService = new OrderService(fixture.db);
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('pins the published lifecycle and creates its initial assigned stage with the order', async () => {
    const owner = fixture.alpha.users.owner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });

    const template = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId,
      code: 'ORDER-LIFECYCLE-TEST',
      name: 'Customer order journey',
      kind: 'ORDER_LIFECYCLE',
    }, 'lifecycle-template-create');
    const versionId = template.data.initialVersionId!;
    await workflowService.saveVersionDraft(owner.principal, versionId, {
      definition: {
        schemaVersion: 1,
        name: 'Customer order journey',
        stages: [{
          key: 'SALES-REVIEW',
          name: 'Review customer order',
          action: 'ORDER_CONFIRM',
          departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 },
          predecessors: [],
          forms: [],
        }],
      },
    }, 'lifecycle-draft-save');
    await workflowService.publishVersion(owner.principal, versionId, 'lifecycle-publish');

    const created = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: '2',
      requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: versionId,
    }, 'lifecycle-order-create');
    const replayed = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: '2',
      requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: versionId,
    }, 'lifecycle-order-create');
    expect(replayed.data.id).toBe(created.data.id);
    const lifecycle = await fixture.db.orderLifecycleInstance.findUnique({
      where: { workspaceId_orderId: { workspaceId: fixture.alpha.workspaceId, orderId: created.data.id } },
      include: { stages: true },
    });

    expect(created.data.lifecycleWorkflowVersionId).toBe(versionId);
    expect(lifecycle?.workflowVersionId).toBe(versionId);
    expect(lifecycle?.stages).toHaveLength(1);
    expect(lifecycle?.stages[0]).toMatchObject({
      stageKey: 'SALES-REVIEW', state: 'READY', assignedMembershipId: owner.membershipId,
    });
    await expect(listLifecycleWorkItems(fixture.db, owner.principal)).resolves.toMatchObject([{
      orderId: created.data.id,
      orderNumber: created.data.orderNumber,
      key: 'SALES-REVIEW',
      state: 'READY',
      assignmentKind: 'MEMBER',
    }]);
    await expect(listLifecycleWorkItems(fixture.db, fixture.alpha.users.planner.principal)).resolves.toHaveLength(0);
    await expect(listLifecycleDepartmentMembers(fixture.db, owner.principal, fixture.alpha.masters.departmentId))
      .resolves.toContainEqual(expect.objectContaining({ membershipId: owner.membershipId }));
  });

  it('claims a department queue atomically and exposes the stage only to its claimant', async () => {
    const owner = fixture.alpha.users.owner;
    const template = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId,
      code: 'ORDER-LIFECYCLE-QUEUE-TEST',
      name: 'Queue-owned customer journey',
      kind: 'ORDER_LIFECYCLE',
    }, 'queue-lifecycle-template-create');
    const versionId = template.data.initialVersionId!;
    await workflowService.saveVersionDraft(owner.principal, versionId, {
      definition: {
        schemaVersion: 1,
        name: 'Queue-owned customer journey',
        stages: [{
          key: 'SALES-QUEUE', name: 'Review customer order', action: 'ORDER_CONFIRM',
          departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: fixture.alpha.masters.departmentId, eligibleRoleCodes: ['OWNER'] },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: [], forms: [],
        }],
      },
    }, 'queue-lifecycle-draft');
    await workflowService.publishVersion(owner.principal, versionId, 'queue-lifecycle-publish');
    const created = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1',
      requestedDate: '2026-11-01T00:00:00.000Z', lifecycleWorkflowVersionId: versionId,
    }, 'queue-lifecycle-order-create');
    const stage = await fixture.db.orderLifecycleStage.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: created.data.id } },
    });

    await expect(claimLifecycleStage(fixture.db, fixture.alpha.users.planner.principal, { stageId: stage.id, expectedVersion: 1 }, 'queue-stage-claim-ineligible'))
      .rejects.toThrow(/permission to claim this stage/i);
    const result = await claimLifecycleStage(fixture.db, owner.principal, { stageId: stage.id, expectedVersion: 1 }, 'queue-stage-claim');
    expect(result.data).toMatchObject({ stageId: stage.id, assignedMembershipId: owner.membershipId, version: 2 });
    expect(await fixture.db.orderLifecycleStage.findUniqueOrThrow({ where: { id: stage.id } }))
      .toMatchObject({ state: 'ACTIVE', assignedMembershipId: owner.membershipId, version: 2 });
    await expect(listLifecycleWorkItems(fixture.db, fixture.alpha.users.planner.principal)).resolves.toHaveLength(0);
    await expect(listLifecycleWorkItems(fixture.db, owner.principal)).resolves.toContainEqual(expect.objectContaining({ id: stage.id, claimedByMe: true }));
  });

  it('keeps an order form pin usable after its published version is retired', async () => {
    const owner = fixture.alpha.users.owner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });
    const forms = new FormService(fixture.db);
    const submissions = new FormSubmissionService(fixture.db);
    const form = await forms.createTemplate(owner.principal, {
      code: 'LIFECYCLE_ORDER_SPEC_PIN', name: 'Order specification', purpose: 'ORDER_SPEC',
    }, 'lifecycle-form-create');
    await forms.updateDraftVersion(owner.principal, form.templateId, form.versionId, {
      expectedVersion: 1,
      definition: { schemaVersion: 1, purpose: 'ORDER_SPEC', fields: [{ key: 'finish', label: 'Finish', kind: 'text', required: true }] },
    }, 'lifecycle-form-draft');
    const published = await forms.publishFormVersion(owner.principal, {
      templateId: form.templateId, versionId: form.versionId, expectedVersion: 2,
    }, 'lifecycle-form-publish');
    const template = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: 'LIFECYCLE_RETIRED_FORM',
      name: 'Pinned retired form journey', kind: 'ORDER_LIFECYCLE',
    }, 'lifecycle-retired-form-template');
    await workflowService.saveVersionDraft(owner.principal, template.data.initialVersionId!, {
      definition: {
        schemaVersion: 1, name: 'Pinned retired form journey', stages: [{
          key: 'SALES-REVIEW', name: 'Review specification', action: 'ORDER_CONFIRM',
          departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: [],
          forms: [{ formVersionId: published.versionId, contentHash: published.hash, required: true, completionPoint: 'BEFORE_ACTION' }],
        }],
      },
    }, 'lifecycle-retired-form-draft');
    await workflowService.publishVersion(owner.principal, template.data.initialVersionId!, 'lifecycle-retired-form-workflow-publish');
    const order = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: template.data.initialVersionId,
    }, 'lifecycle-retired-form-order-create');
    const instance = await fixture.db.formInstance.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, subjectType: 'ORDER', subjectId: order.data.id, formVersionId: published.versionId },
    });

    await forms.retireFormVersion(owner.principal, {
      templateId: form.templateId, versionId: published.versionId, expectedVersion: 3,
    }, 'lifecycle-retire-pinned-form');
    const ordersBeforeFailedIntake = await fixture.db.order.count({ where: { workspaceId: fixture.alpha.workspaceId } });
    await expect(orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-11-02T00:00:00.000Z',
      lifecycleWorkflowVersionId: template.data.initialVersionId,
    }, 'lifecycle-intake-retired-form')).rejects.toThrow(/no longer published/i);
    expect(await fixture.db.order.count({ where: { workspaceId: fixture.alpha.workspaceId } })).toBe(ordersBeforeFailedIntake);
    await expect(orderService.confirmOrder(owner.principal, order.data.id, 'lifecycle-confirm-with-missing-pin'))
      .rejects.toThrow(/Required form.*must be submitted/i);
    await expect(fixture.db.order.findUniqueOrThrow({ where: { id: order.data.id } }))
      .resolves.toMatchObject({ status: 'DRAFT' });
    await submissions.finalizeSubmission(owner.principal, {
      instanceId: instance.id, expectedVersion: 1, answers: { finish: 'matte' },
    }, 'lifecycle-finalize-retired-pin');

    await expect(orderService.confirmOrder(owner.principal, order.data.id, 'lifecycle-confirm-with-retired-pin'))
      .resolves.toMatchObject({ data: { id: order.data.id } });
  });

  it('lets the assigned reviewer complete an evidence-review stage with a version check', async () => {
    const owner = fixture.alpha.users.owner;
    const planner = fixture.alpha.users.planner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: planner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });
    const template = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: 'LIFECYCLE-REVIEW-ACTION',
      name: 'Evidence review action', kind: 'ORDER_LIFECYCLE',
    }, 'lifecycle-review-template');
    await workflowService.saveVersionDraft(owner.principal, template.data.initialVersionId!, {
      definition: {
        schemaVersion: 1, name: 'Evidence review action', stages: [{
          key: 'REVIEW', name: 'Review evidence', action: 'REVIEW_EVIDENCE',
          departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 60 }, predecessors: [], forms: [],
        }],
      },
    }, 'lifecycle-review-draft');
    await workflowService.publishVersion(owner.principal, template.data.initialVersionId!, 'lifecycle-review-publish');
    const order = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: template.data.initialVersionId,
    }, 'lifecycle-review-order-create');
    const stage = await fixture.db.orderLifecycleStage.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id } },
    });

    await expect(reassignLifecycleStage(fixture.db, owner.principal, {
      stageId: stage.id, expectedVersion: stage.version, membershipId: owner.membershipId, reason: 'No change needed',
    }, 'lifecycle-review-noop-reassign')).rejects.toThrow(/already assigned/i);
    expect(await fixture.db.orderLifecycleStage.findUniqueOrThrow({ where: { id: stage.id } })).toMatchObject({ version: stage.version });

    const reassigned = await reassignLifecycleStage(fixture.db, owner.principal, {
      stageId: stage.id, expectedVersion: stage.version, membershipId: planner.membershipId, reason: 'Coverage handoff',
    }, 'lifecycle-review-reassign');
    expect(reassigned.data).toMatchObject({ assignedMembershipId: planner.membershipId, assignedTo: planner.principal.name, version: stage.version + 1 });
    const managerQueue = await listLifecycleWorkItems(fixture.db, { ...owner.principal, departmentId: fixture.alpha.masters.departmentId }, 'department');
    expect(managerQueue.find(row => row.id === stage.id)).toMatchObject({ assignedTo: planner.principal.name, canReassign: true });
    const plannerQueue = await listLifecycleWorkItems(fixture.db, { ...planner.principal, departmentId: fixture.alpha.masters.departmentId }, 'mine');
    expect(plannerQueue.find(row => row.id === stage.id)).toMatchObject({ assignedTo: planner.principal.name, canReassign: false });
    await expect(fixture.db.orderLifecycleEvent.findFirst({ where: { stageId: stage.id, eventType: 'STAGE_REASSIGNED' } }))
      .resolves.toMatchObject({ actorUserId: owner.userId, detailJson: expect.stringContaining('Coverage handoff') });
    expect(await fixture.db.notificationInbox.findMany({ where: { subjectType: 'ORDER_LIFECYCLE_STAGE', subjectId: stage.id }, select: { userId: true, category: true } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: owner.userId, category: 'ASSIGNMENT' }),
        expect.objectContaining({ userId: planner.userId, category: 'ASSIGNMENT' }),
      ]));

    const result = await completeEvidenceReviewStage(fixture.db, planner.principal, { stageId: stage.id, expectedVersion: stage.version + 1 }, 'lifecycle-review-complete');
    expect(result.data).toMatchObject({ stageId: stage.id, state: 'COMPLETED' });
    await expect(fixture.db.orderLifecycleEvent.findFirst({ where: { stageId: stage.id, eventType: 'STAGE_COMPLETED' } }))
      .resolves.toMatchObject({ actorUserId: planner.userId, toState: 'COMPLETED' });
    await expect(completeEvidenceReviewStage(fixture.db, owner.principal, { stageId: stage.id, expectedVersion: stage.version }, 'lifecycle-review-stale'))
      .rejects.toThrow(/not found|changed|ready or active/i);
  });

  it('starts a successor deadline only when its predecessor makes it ready', async () => {
    const owner = fixture.alpha.users.owner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });
    const template = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: 'LIFECYCLE-DEADLINE-ACTIVATION',
      name: 'Deadline activation', kind: 'ORDER_LIFECYCLE',
    }, 'lifecycle-deadline-template');
    await workflowService.saveVersionDraft(owner.principal, template.data.initialVersionId!, {
      definition: { schemaVersion: 1, name: 'Deadline activation', stages: [
        {
          key: 'CONFIRM', name: 'Confirm order', action: 'ORDER_CONFIRM', departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 60 }, predecessors: [], forms: [],
        },
        {
          key: 'REVIEW', name: 'Review evidence', action: 'REVIEW_EVIDENCE', departmentId: fixture.alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 30 }, predecessors: ['CONFIRM'], forms: [],
        },
      ] },
    }, 'lifecycle-deadline-draft');
    await workflowService.publishVersion(owner.principal, template.data.initialVersionId!, 'lifecycle-deadline-publish');
    const order = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: template.data.initialVersionId,
    }, 'lifecycle-deadline-order-create');
    const stagesBefore = await fixture.db.orderLifecycleStage.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id } },
    });
    expect(stagesBefore.find(stage => stage.stageKey === 'REVIEW')?.dueAt).toBeNull();

    await orderService.confirmOrder(owner.principal, order.data.id, 'lifecycle-deadline-confirm');
    await orderService.confirmOrder(owner.principal, order.data.id, 'lifecycle-deadline-confirm');
    const review = await fixture.db.orderLifecycleStage.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id }, stageKey: 'REVIEW' },
    });
    expect(review.state).toBe('READY');
    expect(review.dueAt?.getTime()).toBeGreaterThanOrEqual(Date.now() + 29 * 60_000);
    expect(review.dueAt?.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    const completedEvent = await fixture.db.orderLifecycleEvent.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id }, eventType: 'STAGE_COMPLETED' },
    });
    expect(JSON.parse(completedEvent.detailJson)).toEqual({ action: 'ORDER_CONFIRM', completionFact: 'ORDER_CONFIRMED' });
    expect(await fixture.db.orderLifecycleEvent.count({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id }, eventType: 'STAGE_COMPLETED' },
    })).toBe(1);
  });

  it('routes a published lifecycle from finalized order-form answers and skips the other branch', async () => {
    const owner = fixture.alpha.users.owner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: fixture.alpha.masters.departmentId },
    });
    const forms = new FormService(fixture.db);
    const submissions = new FormSubmissionService(fixture.db);
    const form = await forms.createTemplate(owner.principal, {
      code: 'LIFECYCLE_BRANCH_SPEC', name: 'Order path selection', purpose: 'ORDER_SPEC',
    }, 'lifecycle-branch-form-create');
    await forms.updateDraftVersion(owner.principal, form.templateId, form.versionId, {
      expectedVersion: 1,
      definition: {
        schemaVersion: 1, purpose: 'ORDER_SPEC', fields: [{
          key: 'order_path', label: 'Order path', kind: 'select', required: true,
          options: [{ value: 'standard', label: 'Standard' }, { value: 'custom', label: 'Custom' }],
        }],
      },
    }, 'lifecycle-branch-form-draft');
    const published = await forms.publishFormVersion(owner.principal, {
      templateId: form.templateId, versionId: form.versionId, expectedVersion: 2,
    }, 'lifecycle-branch-form-publish');
    const workflow = await workflowService.createTemplate(owner.principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: 'LIFECYCLE-CONDITIONAL-BRANCH',
      name: 'Conditional order path', kind: 'ORDER_LIFECYCLE',
    }, 'lifecycle-branch-workflow-create');
    const assigned = (key: string) => ({
      key, name: key, action: 'REVIEW_EVIDENCE' as const,
      departmentId: fixture.alpha.masters.departmentId,
      assignment: { kind: 'MEMBER' as const, membershipId: owner.membershipId, departmentId: fixture.alpha.masters.departmentId },
      schedule: { kind: 'DEADLINE' as const, dueAfterMinutes: 60 },
    });
    await workflowService.saveVersionDraft(owner.principal, workflow.data.initialVersionId!, {
      definition: {
        schemaVersion: 1, name: 'Conditional order path', stages: [
          {
            ...assigned('SALES'), name: 'Confirm order', action: 'ORDER_CONFIRM' as const,
            predecessors: [], forms: [{ formVersionId: published.versionId, contentHash: published.hash, required: true, completionPoint: 'BEFORE_ACTION' as const }],
          },
          {
            ...assigned('STANDARD'), predecessors: ['SALES'], forms: [],
            activationCondition: { sourceStageKey: 'SALES', formVersionId: published.versionId, fieldKey: 'order_path', operator: 'EQUALS' as const, value: 'standard' },
          },
          {
            ...assigned('CUSTOM'), predecessors: ['SALES'], forms: [],
            activationCondition: { sourceStageKey: 'SALES', formVersionId: published.versionId, fieldKey: 'order_path', operator: 'EQUALS' as const, value: 'custom' },
          },
          { ...assigned('END'), predecessors: ['STANDARD', 'CUSTOM'], forms: [] },
        ],
      },
    }, 'lifecycle-branch-workflow-draft');
    await workflowService.publishVersion(owner.principal, workflow.data.initialVersionId!, 'lifecycle-branch-workflow-publish');
    const order = await orderService.createOrderDraft(owner.principal, {
      customerId: fixture.alpha.masters.customerId, orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-11-01T00:00:00.000Z',
      lifecycleWorkflowVersionId: workflow.data.initialVersionId,
    }, 'lifecycle-branch-order-create');
    const formInstance = await fixture.db.formInstance.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, subjectType: 'ORDER', subjectId: order.data.id, formVersionId: published.versionId },
    });
    await submissions.finalizeSubmission(owner.principal, {
      instanceId: formInstance.id, expectedVersion: 1, answers: { order_path: 'standard' },
    }, 'lifecycle-branch-form-submit');

    await orderService.confirmOrder(owner.principal, order.data.id, 'lifecycle-branch-confirm');
    const stages = await fixture.db.orderLifecycleStage.findMany({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id } },
    });
    expect(stages.map(({ stageKey, state }) => [stageKey, state]).sort(([left], [right]) => String(left).localeCompare(String(right)))).toEqual([
      ['CUSTOM', 'SKIPPED'], ['END', 'PENDING'],
      ['SALES', 'COMPLETED'], ['STANDARD', 'READY'],
    ]);
    const standardStage = stages.find((candidate) => candidate.stageKey === 'STANDARD')!;
    await completeEvidenceReviewStage(fixture.db, owner.principal, {
      stageId: standardStage.id, expectedVersion: standardStage.version,
    }, 'lifecycle-branch-standard-complete');
    await expect(fixture.db.orderLifecycleStage.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, instance: { orderId: order.data.id }, stageKey: 'END' },
    })).resolves.toMatchObject({ state: 'READY' });
  });
});
