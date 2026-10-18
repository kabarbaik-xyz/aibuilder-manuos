import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '@/server/modules/forms/service';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { assertRequiredFormsFinalized } from '@/server/modules/forms/completion';

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

  it('does not retroactively gate an existing order when a new required form binding is added', async () => {
    const orderType = await fixture.db.orderType.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      code: `ORDER_TYPE_${randomUUID().slice(0, 8)}`,
      name: 'Order type for pin snapshot test',
    } });
    const order = await new OrderService(fixture.db).createOrderDraft(fixture.alpha.users.owner.principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: orderType.id,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: 1,
      requestedDate: '2026-11-01T00:00:00.000Z',
    }, `pin-before-binding-${randomUUID()}`);

    const form = await forms.createTemplate(fixture.alpha.users.owner.principal, {
      code: `LATE_ORDER_FORM_${randomUUID().slice(0, 8)}`,
      name: 'Late order form',
      purpose: 'ORDER_SPEC',
    });
    await forms.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: form.templateId,
      versionId: form.versionId,
      expectedVersion: 1,
    });
    await forms.bindFormVersion(fixture.alpha.users.owner.principal, {
      formVersionId: form.versionId,
      context: 'ORDER_TYPE',
      orderTypeId: orderType.id,
      required: true,
    }, `late-binding-${randomUUID()}`);

    await expect(fixture.db.$transaction((tx) => assertRequiredFormsFinalized(tx, {
      workspaceId: fixture.alpha.workspaceId,
      subjectType: 'ORDER',
      subjectId: order.data.id,
    }))).resolves.toBeUndefined();
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
    expect(await fixture.db.auditEvent.count({ where: { workspaceId: fixture.alpha.workspaceId, action: 'forms.binding.create', aggregateId: result.bindingId } })).toBe(1);

    const order = await new OrderService(fixture.db).createOrderDraft(fixture.alpha.users.owner.principal, {
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedQuantity: 1,
      requestedDate: '2026-11-01T00:00:00.000Z',
    }, 'form-binding-order-create');
    const orderId = order.data.id;
    expect(await fixture.db.formInstance.findMany({ where: { subjectType: 'ORDER', subjectId: orderId } }))
      .toMatchObject([{ formVersionId: form.versionId, status: 'PENDING', required: true, completionPoint: 'BEFORE_ACTION' }]);
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

  it('rejects malformed, duplicate, foreign and missing form binding targets before writing', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const form = await forms.createTemplate(owner, {
      code: `BIND_TARGET_${randomUUID().slice(0, 8)}`,
      name: 'Binding target validation',
      purpose: 'ORDER_SPEC',
    });
    await forms.publishFormVersion(owner, { templateId: form.templateId, versionId: form.versionId, expectedVersion: 1 });

    await expect(forms.bindFormVersion(owner, {
      formVersionId: form.versionId, context: 'ORDER_TYPE',
    }, `bind-missing-target-${randomUUID()}`)).rejects.toThrow(/exactly the target fields/i);
    await expect(forms.bindFormVersion(owner, {
      formVersionId: form.versionId, context: 'ORDER_TYPE', orderTypeId: fixture.alpha.masters.orderTypeId,
      workflowVersionId: randomUUID(), workflowNodeKey: 'OP-10',
    }, `bind-extra-target-${randomUUID()}`)).rejects.toThrow(/exactly the target fields/i);

    const foreignOrderType = await fixture.db.orderType.create({ data: {
      workspaceId: fixture.beta.workspaceId, code: `FOREIGN_${randomUUID().slice(0, 8)}`, name: 'Foreign order type',
    } });
    await expect(forms.bindFormVersion(owner, {
      formVersionId: form.versionId, context: 'ORDER_TYPE', orderTypeId: foreignOrderType.id,
    }, `bind-foreign-target-${randomUUID()}`)).rejects.toThrow(/not found/i);

    const valid = await forms.bindFormVersion(owner, {
      formVersionId: form.versionId, context: 'ORDER_TYPE', orderTypeId: fixture.alpha.masters.orderTypeId,
    }, `bind-valid-target-${randomUUID()}`);
    await expect(forms.bindFormVersion(owner, {
      formVersionId: form.versionId, context: 'ORDER_TYPE', orderTypeId: fixture.alpha.masters.orderTypeId,
    }, `bind-duplicate-target-${randomUUID()}`)).rejects.toThrow(/already bound/i);

    const qcForm = await forms.createTemplate(owner, {
      code: `FOREIGN_QC_BIND_${randomUUID().slice(0, 8)}`, name: 'Foreign checklist binding', purpose: 'QC_EVIDENCE',
    });
    await forms.publishFormVersion(owner, { templateId: qcForm.templateId, versionId: qcForm.versionId, expectedVersion: 1 });
    const foreignChecklist = await fixture.db.qcChecklist.create({ data: {
      workspaceId: fixture.beta.workspaceId, code: `FOREIGN_QC_${randomUUID().slice(0, 8)}`, name: 'Foreign checklist', isPublished: true,
    } });
    await expect(forms.bindFormVersion(owner, {
      formVersionId: qcForm.versionId, context: 'QC_CHECKLIST', qcChecklistId: foreignChecklist.id,
    }, `bind-foreign-checklist-${randomUUID()}`)).rejects.toThrow(/not found/i);

    const workflowService = new WorkflowService(fixture.db);
    const workflow = await workflowService.createTemplate(owner, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: `BIND_NODE_${randomUUID().slice(0, 8)}`, name: 'Binding node validation',
    }, `bind-workflow-${randomUUID()}`);
    const taskForm = await forms.createTemplate(owner, {
      code: `BIND_NODE_FORM_${randomUUID().slice(0, 8)}`, name: 'Node evidence', purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(owner, { templateId: taskForm.templateId, versionId: taskForm.versionId, expectedVersion: 1 });
    await expect(forms.bindFormVersion(owner, {
      formVersionId: taskForm.versionId, context: 'WORKFLOW_NODE', workflowVersionId: workflow.data.initialVersionId,
      workflowNodeKey: 'DOES-NOT-EXIST',
    }, `bind-missing-node-${randomUUID()}`)).rejects.toThrow(/does not exist/i);
    const betaOrderType = await fixture.db.orderType.create({ data: {
      workspaceId: fixture.beta.workspaceId, code: `FOREIGN_WF_TYPE_${randomUUID().slice(0, 8)}`, name: 'Foreign workflow order type',
    } });
    const foreignWorkflow = await workflowService.createTemplate(fixture.beta.users.owner.principal, {
      orderTypeId: betaOrderType.id, code: `FOREIGN_BIND_NODE_${randomUUID().slice(0, 8)}`, name: 'Foreign workflow',
    }, `foreign-bind-workflow-${randomUUID()}`);
    await expect(forms.bindFormVersion(owner, {
      formVersionId: taskForm.versionId, context: 'WORKFLOW_NODE', workflowVersionId: foreignWorkflow.data.initialVersionId,
      workflowNodeKey: 'OP-10',
    }, `bind-foreign-workflow-${randomUUID()}`)).rejects.toThrow(/not found/i);

    expect(await fixture.db.formBinding.count({ where: { formVersionId: { in: [form.versionId, qcForm.versionId, taskForm.versionId] } } })).toBe(1);
    expect(await fixture.db.formBinding.findUniqueOrThrow({ where: { id: valid.bindingId } })).toMatchObject({ orderTypeId: fixture.alpha.masters.orderTypeId });
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
      completionPoint: 'BEFORE_ACTION',
    }, 'task-form-binding-create');
    expect(await fixture.db.formBinding.findUniqueOrThrow({ where: { id: binding.bindingId } }))
      .toMatchObject({ context: 'WORKFLOW_NODE', workflowVersionId: workflow.data.initialVersionId, workflowNodeKey: 'OP-10', completionPoint: 'BEFORE_ACTION' });

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

    const fork = await workflowService.forkVersion(owner, workflow.data.initialVersionId, 'task-form-workflow-fork');
    expect(await fixture.db.formBinding.findMany({ where: { workflowVersionId: fork.data.id } }))
      .toMatchObject([{ formVersionId: form.versionId, workflowNodeKey: 'OP-10', required: true, completionPoint: 'BEFORE_ACTION' }]);
  });

  it('includes published task form bindings in the workflow execution hash', async () => {
    const owner = fixture.alpha.users.owner.principal;
    const workflows = new WorkflowService(fixture.db);
    const createWorkflow = (code: string) => workflows.createTemplate(owner, {
      orderTypeId: fixture.alpha.masters.orderTypeId,
      code,
      name: 'Workflow execution hash',
    }, `hash-workflow-${code}`);
    const [withForm, withoutForm] = await Promise.all([
      createWorkflow(`HASH_FORM_${randomUUID().slice(0, 8)}`),
      createWorkflow(`HASH_EMPTY_${randomUUID().slice(0, 8)}`),
    ]);
    const form = await forms.createTemplate(owner, {
      code: `HASH_TASK_${randomUUID().slice(0, 8)}`,
      name: 'Hash task evidence',
      purpose: 'TASK_EVIDENCE',
    });
    await forms.publishFormVersion(owner, { templateId: form.templateId, versionId: form.versionId, expectedVersion: 1 });
    await forms.bindFormVersion(owner, {
      formVersionId: form.versionId,
      context: 'WORKFLOW_NODE',
      workflowVersionId: withForm.data.initialVersionId,
      workflowNodeKey: 'OP-10',
      required: true,
      completionPoint: 'BEFORE_ACTION',
    }, 'hash-workflow-binding');

    const publishedWithForm = await workflows.publishVersion(owner, withForm.data.initialVersionId, 'hash-workflow-publish-form');
    const publishedWithoutForm = await workflows.publishVersion(owner, withoutForm.data.initialVersionId, 'hash-workflow-publish-empty');
    expect(publishedWithForm.data.definitionHash).toBeDefined();
    expect(publishedWithForm.data.definitionHash).not.toBe(publishedWithoutForm.data.definitionHash);
  });
});
