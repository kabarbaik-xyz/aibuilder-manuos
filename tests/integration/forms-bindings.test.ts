import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '@/server/modules/forms/service';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';

describe('published form workflow bindings', () => {
  let fixture: FactoryFixture;
  let forms: FormService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    forms = new FormService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('pins an order form to a valid order type and records the command', async () => {
    const form = await forms.createTemplate(fixture.alpha.users.owner.principal, {
      code: `ORDER_BIND_${randomUUID().slice(0, 8)}`,
      name: 'Order specification',
      purpose: 'ORDER_SPEC',
    });
    await forms.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: form.templateId,
      versionId: form.versionId,
      expectedVersion: 1,
    });

    const result = await forms.bindFormVersion(fixture.alpha.users.owner.principal, {
      formVersionId: form.versionId,
      context: 'ORDER_TYPE',
      orderTypeId: fixture.alpha.masters.orderTypeId,
      required: true,
    }, 'form-binding-spec');

    expect(result.bindingId).toBeTruthy();
    expect(await fixture.db.formBinding.findUniqueOrThrow({ where: { id: result.bindingId } }))
      .toMatchObject({ context: 'ORDER_TYPE', orderTypeId: fixture.alpha.masters.orderTypeId, required: true });
    expect(await fixture.db.commandReceipt.count({ where: { workspaceId: fixture.alpha.workspaceId, key: 'form-binding-spec' } })).toBe(1);
    expect(await fixture.db.auditEvent.count({ where: { workspaceId: fixture.alpha.workspaceId, action: 'forms.binding.create' } })).toBe(1);

    const order = await new OrderService(fixture.db).createOrderDraft(fixture.alpha.users.owner.principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: 1,
      requestedDate: '2026-11-01T00:00:00.000Z',
    }, 'form-binding-order-create');
    const orderId = order.data.id;
    expect(await fixture.db.formInstance.findMany({ where: { subjectType: 'ORDER', subjectId: orderId } }))
      .toMatchObject([{ formVersionId: form.versionId, status: 'PENDING' }]);
  });

  it('rejects a task evidence form bound to an order intake context', async () => {
    const form = await forms.createTemplate(fixture.alpha.users.owner.principal, {
      code: `TASK_BIND_${randomUUID().slice(0, 8)}`,
      name: 'Task evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: form.templateId,
      versionId: form.versionId,
      expectedVersion: 1,
    });

    await expect(forms.bindFormVersion(fixture.alpha.users.owner.principal, {
      formVersionId: form.versionId,
      context: 'ORDER_TYPE',
      orderTypeId: fixture.alpha.masters.orderTypeId,
    }, 'form-binding-invalid')).rejects.toThrow(/require a ORDER_SPEC form/i);
    expect(await fixture.db.formBinding.count({ where: { formVersionId: form.versionId } })).toBe(0);
  });

  it('freezes task form bindings when their workflow version is published', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const workflowService = new WorkflowService(fixture.db);
    const workflow = await workflowService.createTemplate(owner, {
      orderTypeId: fixture.alpha.masters.orderTypeId,
      code: `TASK_FORM_WF_${randomUUID().slice(0, 8)}`,
      name: 'Task evidence routing',
    }, 'task-form-workflow-create');
    const form = await forms.createTemplate(owner, {
      code: `TASK_FORM_${randomUUID().slice(0, 8)}`,
      name: 'Task evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(owner, {
      templateId: form.templateId,
      versionId: form.versionId,
      expectedVersion: 1,
    });

    const binding = await forms.bindFormVersion(owner, {
      formVersionId: form.versionId,
      context: 'WORKFLOW_NODE',
      workflowVersionId: workflow.data.initialVersionId,
      workflowNodeKey: 'OP-10',
      required: true,
    }, 'task-form-binding-create');
    expect(await fixture.db.formBinding.findUniqueOrThrow({ where: { id: binding.bindingId } }))
      .toMatchObject({ context: 'WORKFLOW_NODE', workflowVersionId: workflow.data.initialVersionId, workflowNodeKey: 'OP-10' });

    await workflowService.publishVersion(owner, workflow.data.initialVersionId, 'task-form-workflow-publish');
    const laterForm = await forms.createTemplate(owner, {
      code: `TASK_FORM_LATER_${randomUUID().slice(0, 8)}`,
      name: 'Later task evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(owner, {
      templateId: laterForm.templateId,
      versionId: laterForm.versionId,
      expectedVersion: 1,
    });

    await expect(forms.bindFormVersion(owner, {
      formVersionId: laterForm.versionId,
      context: 'WORKFLOW_NODE',
      workflowVersionId: workflow.data.initialVersionId,
      workflowNodeKey: 'OP-10',
      required: true,
    }, 'task-form-binding-after-publish')).rejects.toThrow(/only be bound to a draft workflow/i);
    expect(await fixture.db.formBinding.count({ where: { workflowVersionId: workflow.data.initialVersionId } })).toBe(1);
  });
});
