import { fixtureBuilderAI } from '../fixtures/builder-ai';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '../../src/server/modules/forms/service';
import { FormSubmissionService } from '../../src/server/modules/forms/submissions';
import { assertRequiredFormsFinalized } from '../../src/server/modules/forms/completion';
import { BadRequestError } from '../../src/domain/errors';
import { FormDefinition } from '../../src/domain/forms/types';

describe('DF05: Form Gates & Domain Lifecycle Integration', () => {
  let fixture: FactoryFixture;
  let formService: FormService;
  let submissionService: FormSubmissionService;
  let templateId: string;
  let versionId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    formService = new FormService(fixture.db);
    submissionService = new FormSubmissionService(fixture.db);

    // Setup published form template
    const tpl = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'TASK_CHECK_01',
      name: 'Task Safety & Setup Checklist',
      purpose: 'TASK_EVIDENCE',
    });
    templateId = tpl.templateId;
    versionId = tpl.versionId;

    const def: FormDefinition = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        {
          key: 'operator_notes',
          label: 'Operator Notes',
          kind: 'text',
          required: true,
        },
      ],
    };

    await formService.updateDraftVersion(fixture.alpha.users.owner.principal, templateId, versionId, {
      expectedVersion: 1,
      definition: def,
    });

    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId,
      versionId,
      expectedVersion: 2,
    });
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function createAssignedTaskSubject() {
    const order = await fixture.db.order.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      orderNumber: `ORD-FORM-GATE-${randomUUID().slice(0, 8)}`,
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
      code: `WF-FORM-GATE-${randomUUID().slice(0, 8)}`,
      name: 'Form gate test workflow',
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
    return fixture.db.task.create({ data: {
      workspaceId: fixture.alpha.workspaceId,
      instanceId: workflowInstance.id,
      nodeKey: 'OP-10',
      status: 'ASSIGNED',
      assignedTechnicianId: fixture.alpha.masters.technicianId,
    } });
  }

  it('allows subject transition when no required form bindings exist', async () => {
    const dummySubjectId = '00000000-0000-0000-0000-000000000001';
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'TASK',
          subjectId: dummySubjectId,
        });
      })
    ).resolves.not.toThrow();
  });

  it('enforces pending required evidence at its configured completion point only', async () => {
    const taskBeforeStage = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: versionId,
      subjectType: 'TASK',
      subjectId: 'task-before-stage-form-gate',
      completionPoint: 'BEFORE_STAGE_COMPLETION',
    }));
    await expect(fixture.db.$transaction((tx) => assertRequiredFormsFinalized(tx, {
      workspaceId: fixture.alpha.workspaceId,
      subjectType: 'TASK',
      subjectId: 'task-before-stage-form-gate',
      completionPoint: 'BEFORE_ACTION',
    }))).resolves.toBeUndefined();
    await expect(fixture.db.$transaction((tx) => assertRequiredFormsFinalized(tx, {
      workspaceId: fixture.alpha.workspaceId,
      subjectType: 'TASK',
      subjectId: 'task-before-stage-form-gate',
      completionPoint: 'BEFORE_STAGE_COMPLETION',
    }))).rejects.toThrow(/has not been finalized/i);
    expect(taskBeforeStage.instanceId).toBeTruthy();

    await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: versionId,
      subjectType: 'TASK',
      subjectId: 'task-before-action-form-gate',
      completionPoint: 'BEFORE_ACTION',
    }));
    await expect(fixture.db.$transaction((tx) => assertRequiredFormsFinalized(tx, {
      workspaceId: fixture.alpha.workspaceId,
      subjectType: 'TASK',
      subjectId: 'task-before-action-form-gate',
      completionPoint: 'BEFORE_ACTION',
    }))).rejects.toThrow(/has not been finalized/i);
    await expect(fixture.db.$transaction((tx) => assertRequiredFormsFinalized(tx, {
      workspaceId: fixture.alpha.workspaceId,
      subjectType: 'TASK',
      subjectId: 'task-before-action-form-gate',
      completionPoint: 'BEFORE_STAGE_COMPLETION',
    }))).resolves.toBeUndefined();
  });

  it('blocks domain gate when a required form instance is in PENDING/DRAFT status', async () => {
    const subjectId = '00000000-0000-0000-0000-000000000002';

    // Create form instance for task
    await fixture.db.$transaction(async (tx) => {
      await formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'TASK',
        subjectId,
      });
    });

    // Assert that completion check throws BadRequestError
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'TASK',
          subjectId,
        });
      })
    ).rejects.toThrowError(BadRequestError);
  });

  it('allows domain gate once the form instance is finalized (SUBMITTED)', async () => {
    const task = await createAssignedTaskSubject();
    const subjectId = task.id;

    // 1. Create form instance
    const { instanceId } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'TASK',
        subjectId,
      });
    });

    // 2. Finalize submission with valid answers
    await submissionService.finalizeSubmission(fixture.alpha.users.operator.principal, {
      instanceId,
      expectedVersion: 1,
      answers: {
        operator_notes: 'All guards inspected and verified clean',
      },
    });

    // 3. Verify gate check now passes without throwing
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'TASK',
          subjectId,
        });
      })
    ).resolves.not.toThrow();
  });

  it('proves an AI-assisted form draft proposal applies to draft, publishes, pins to task, gates completion, and preserves pinned version', async () => {
    const { BuilderProposalService } = await import('../../src/server/modules/builder-proposals/service');
    const proposalService = new BuilderProposalService(fixture.db, fixtureBuilderAI);

    // 1. Create a draft form template
    const tpl = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'AI_ASSISTED_TASK_QC',
      name: 'AI Assisted Task QC Check',
      purpose: 'TASK_EVIDENCE',
    });

    // 2. Generate an AI proposal targeting this draft form
    const proposal = await proposalService.createProposal(fixture.alpha.users.owner.principal, {
      target: 'FORM',
      targetDraftId: tpl.versionId,
      prompt: 'Safety and quality evidence for milling machine operation',
    });

    expect(proposal.status).toBe('GENERATED');
    expect(proposal.candidateHash).toBeDefined();

    // 3. Apply proposal with human acknowledgment
    const applyResult = await proposalService.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
      expectedTargetRevision: 1,
      reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true,
      idempotencyKey: 'idemp-ai-gate-001',
    });
    expect(applyResult.status).toBe('APPLIED');

    // 4. Publish the reviewed draft (now version 2 after apply increment)
    const pub = await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: tpl.templateId,
      versionId: tpl.versionId,
      expectedVersion: 2,
    });
    expect(pub.versionId).toBe(tpl.versionId);

    // 5. Instantiate task pinned to published version
    const task = await createAssignedTaskSubject();
    const taskId = task.id;
    const { instanceId } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: tpl.versionId,
        subjectType: 'TASK',
        subjectId: taskId,
      });
    });

    // 6. Assert task completion is gated
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'TASK',
          subjectId: taskId,
        });
      })
    ).rejects.toThrowError(BadRequestError);

    // 7. Complete the form submission with required answers
    await submissionService.finalizeSubmission(fixture.alpha.users.operator.principal, {
      instanceId,
      expectedVersion: 1,
      answers: {
        inspection_result: 'pass',
      },
    });

    // 8. Assert gate now passes
    await expect(
      fixture.db.$transaction(async (tx) => {
        await assertRequiredFormsFinalized(tx, {
          workspaceId: fixture.alpha.workspaceId,
          subjectType: 'TASK',
          subjectId: taskId,
        });
      })
    ).resolves.not.toThrow();

    // 9. Verify pinned instance retains v1 definition even if template drafts evolve
    const instance = await fixture.db.formInstance.findUnique({
      where: { id: instanceId },
      include: { formVersion: true },
    });
    expect(instance?.formVersionId).toBe(tpl.versionId);
    expect(instance?.status).toBe('SUBMITTED');
  });
});

