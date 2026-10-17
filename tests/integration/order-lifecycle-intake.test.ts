import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { listLifecycleDepartmentMembers, listLifecycleWorkItems } from '@/server/modules/order-lifecycle/queries';
import { claimLifecycleStage } from '@/server/modules/order-lifecycle/assignments';

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
});
