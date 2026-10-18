import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '@/server/modules/forms/service';
import { FormSubmissionService } from '@/server/modules/forms/submissions';

describe('form subject access', () => {
  let fixture: FactoryFixture;
  let formService: FormService;
  let submissions: FormSubmissionService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    formService = new FormService(fixture.db);
    submissions = new FormSubmissionService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('does not expose a task evidence form to an operator who is not assigned to its task', async () => {
    const form = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'TASK_ACCESS_CHECK',
      name: 'Task Access Check',
      purpose: 'TASK_EVIDENCE',
    });
    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: form.templateId,
      versionId: form.versionId,
      expectedVersion: 1,
    });
    const order = await fixture.db.order.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      orderNumber: `ORD-FORM-${randomUUID().slice(0, 8)}`,
      customerId: fixture.alpha.masters.customerId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      itemId: fixture.alpha.masters.fgItemId,
      orderedAtoms: 1_000_000n,
      requestedDate: new Date('2026-11-01T00:00:00.000Z'),
      facilityId: fixture.alpha.users.owner.principal.facilityId,
      status: 'RELEASED',
    } });
    const workflowTemplate = await fixture.db.workflowTemplate.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      orderTypeId: fixture.alpha.masters.orderTypeId,
      code: `WF-FORM-${randomUUID().slice(0, 8)}`,
      name: 'Form Access Test Workflow',
    } });
    const workflowVersion = await fixture.db.workflowVersion.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      templateId: workflowTemplate.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      definitionJson: '{}',
    } });
    const revision = await fixture.db.engineeringRevision.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      orderId: order.id,
      revisionNumber: 1,
      status: 'APPROVED',
      specsJson: '{}',
      workflowVersionId: workflowVersion.id,
    } });
    const workflowInstance = await fixture.db.workflowInstance.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      orderId: order.id,
      workflowVersionId: workflowVersion.id,
      engineeringRevisionId: revision.id,
    } });
    const task = await fixture.db.task.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      instanceId: workflowInstance.id,
      nodeKey: 'OP-10',
    } });
    const instance = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: form.versionId,
      subjectType: 'TASK',
      subjectId: task.id,
    }));

    await expect(submissions.getInstance(fixture.alpha.users.operator.principal, instance.instanceId))
      .rejects.toThrow(/not found|permission denied/i);
    await expect(submissions.listInstancesForSubject(fixture.alpha.users.operator.principal, 'TASK', task.id))
      .resolves.toHaveLength(0);
    await expect(submissions.saveDraft(fixture.alpha.users.operator.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: {},
    })).rejects.toThrow(/not found|permission denied/i);

    await fixture.db.task.update({ where: { id: task.id }, data: { assignedTechnicianId: fixture.alpha.masters.technicianId } });
    await expect(submissions.listInstancesForSubject(fixture.alpha.users.operator.principal, 'TASK', task.id))
      .resolves.toHaveLength(1);
    await expect(submissions.createCorrection(fixture.alpha.users.operator.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      reason: 'Unauthorized correction attempt',
      answers: {},
    })).rejects.toThrow(/permission denied/i);
    const writes = await Promise.allSettled([
      submissions.saveDraft(fixture.alpha.users.operator.principal, { instanceId: instance.instanceId, expectedVersion: 1, answers: { notes: 'first' } }, 'form-race-a'),
      submissions.saveDraft(fixture.alpha.users.operator.principal, { instanceId: instance.instanceId, expectedVersion: 1, answers: { notes: 'second' } }, 'form-race-b'),
    ]);
    expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((write) => write.status === 'rejected')).toHaveLength(1);
    const rejectedWrite = writes.find((write) => write.status === 'rejected');
    expect(rejectedWrite?.status === 'rejected' ? String(rejectedWrite.reason) : '').toMatch(/conflict|version|changed/i);
    expect(await fixture.db.formSubmission.count({ where: { instanceId: instance.instanceId } })).toBe(1);

    const current = await fixture.db.formInstance.findUniqueOrThrow({ where: { id: instance.instanceId } });
    const replayKey = 'form-draft-replay';
    const replayInput = { instanceId: instance.instanceId, expectedVersion: current.version, answers: { notes: 'replay' } };
    const first = await submissions.saveDraft(fixture.alpha.users.operator.principal, replayInput, replayKey);
    const replay = await submissions.saveDraft(fixture.alpha.users.operator.principal, replayInput, replayKey);
    expect(replay).toEqual(first);
    expect(await fixture.db.formInstance.findUniqueOrThrow({ where: { id: instance.instanceId } })).toMatchObject({ version: current.version + 1 });
    await expect(submissions.saveDraft(fixture.alpha.users.operator.principal, {
      ...replayInput,
      answers: { notes: 'different payload' },
    }, replayKey)).rejects.toThrow(/different request payload/i);

    const otherFacility = await fixture.db.facility.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        code: `FAC-OUTSIDE-${randomUUID().slice(0, 8)}`,
        name: 'Outside facility',
      },
    });
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: fixture.alpha.users.operator.membershipId } },
      data: { facilityId: otherFacility.id },
    });
    await expect(submissions.getInstance(fixture.alpha.users.operator.principal, instance.instanceId))
      .rejects.toThrow(/permission denied/i);
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: fixture.alpha.users.operator.membershipId } },
      data: { facilityId: fixture.alpha.users.operator.principal.facilityId },
    });

    const qcForm = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: `QC_FACILITY_CHECK_${randomUUID().slice(0, 8)}`,
      name: 'QC facility access check',
      purpose: 'QC_EVIDENCE',
    });
    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: qcForm.templateId,
      versionId: qcForm.versionId,
      expectedVersion: 1,
    });
    const output = await fixture.db.productionOutput.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      taskId: task.id,
      itemId: fixture.alpha.masters.fgItemId,
      outputAtoms: 1_000_000n,
      destinationLocationId: fixture.alpha.masters.fgLocationId,
      operatorUserId: fixture.alpha.users.operator.userId,
    } });
    const inspection = await fixture.db.inspection.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      sourceType: 'PRODUCTION_OUTPUT',
      productionOutputId: output.id,
      inspectedAtoms: 1_000_000n,
      inspectorUserId: fixture.alpha.users.qc.userId,
    } });
    const inspectionForm = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: qcForm.versionId,
      subjectType: 'INSPECTION',
      subjectId: inspection.id,
    }));
    await expect(submissions.getInstance(fixture.alpha.users.qc.principal, inspectionForm.instanceId)).resolves.toBeDefined();
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: fixture.alpha.users.qc.membershipId } },
      data: { facilityId: otherFacility.id },
    });
    await expect(submissions.getInstance(fixture.alpha.users.qc.principal, inspectionForm.instanceId))
      .rejects.toThrow(/permission denied/i);
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: fixture.alpha.users.qc.membershipId } },
      data: { facilityId: fixture.alpha.users.qc.principal.facilityId },
    });

    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: fixture.alpha.workspaceId, id: fixture.alpha.users.operator.membershipId } },
      data: { status: 'DISABLED' },
    });
    await expect(submissions.getInstance(fixture.alpha.users.operator.principal, instance.instanceId))
      .rejects.toThrow(/active workspace membership|permission denied/i);
  });
});
