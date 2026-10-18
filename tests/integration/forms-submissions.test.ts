import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '../../src/server/modules/forms/service';
import { FormSubmissionService } from '../../src/server/modules/forms/submissions';
import { FormDefinition } from '../../src/domain/forms/types';

describe('DF03: Real Submission Commands, Access Boundaries, and Evidence Lifecycle', () => {
  let fixture: FactoryFixture;
  let formService: FormService;
  let submissionService: FormSubmissionService;
  let templateId: string;
  let versionId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    formService = new FormService(fixture.db);
    submissionService = new FormSubmissionService(fixture.db);

    // Setup a published form template with conditional paint_code
    const tpl = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'QC_PAINT_EVIDENCE',
      name: 'Paint Evidence Form',
      purpose: 'QC_EVIDENCE',
    });
    templateId = tpl.templateId;
    versionId = tpl.versionId;

    const def: FormDefinition = {
      schemaVersion: 1,
      purpose: 'QC_EVIDENCE',
      fields: [
        {
          key: 'finish',
          label: 'Finish',
          kind: 'select',
          required: true,
          options: [
            { value: 'painted', label: 'Painted' },
            { value: 'raw', label: 'Raw' },
          ],
        },
        {
          key: 'paint_code',
          label: 'Paint Code',
          kind: 'text',
          required: true,
          visibleWhen: { fieldKey: 'finish', operator: 'equals', value: 'painted' },
        },
        {
          key: 'dry_film_microns',
          label: 'Dry Film Thickness (um)',
          kind: 'decimal',
          precision: 1,
          required: true,
        },
        {
          key: 'machine_reference',
          label: 'Inspection machine',
          kind: 'reference',
          required: false,
          referenceType: 'machine',
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
    await fixture.close();
  });

  it('allows saving incomplete DRAFT answers but rejects invalid supplied types or unknown keys', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-001', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'INSPECTION',
        subjectId: 'qc-insp-001',
      });
    });

    // Unknown key must fail even in DRAFT mode
    await expect(
      submissionService.saveDraft(fixture.alpha.users.qc.principal, {
        instanceId: instance.instanceId,
        expectedVersion: 1,
        answers: { finish: 'painted', invalid_injected_key: 'malicious' },
      })
    ).rejects.toThrow(/Draft validation failed/);

    // Saving valid partial draft succeeds (missing required dry_film_microns is allowed in DRAFT)
    const draftRes = await submissionService.saveDraft(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: { finish: 'painted', paint_code: 'RAL-7035' },
    });

    expect(draftRes.submissionId).toBeDefined();
    expect(draftRes.version).toBe(2);

    const detail = await submissionService.getInstance(fixture.alpha.users.qc.principal, instance.instanceId);
    expect(detail.instance.status).toBe('DRAFT');
    expect(detail.latestSubmission?.status).toBe('DRAFT');
    expect(detail.latestSubmission?.answers.paint_code).toBe('RAL-7035');
  });

  it('denies customer users from internal form submission', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-002', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'INSPECTION',
        subjectId: 'qc-insp-002',
      });
    });

    await expect(
      submissionService.saveDraft(fixture.alpha.users.customerUser.principal, {
        instanceId: instance.instanceId,
        expectedVersion: 1,
        answers: { finish: 'raw' },
      })
    ).rejects.toThrow(/Customer users are not permitted/);
  });

  it('blocks finalization when required visible fields are missing, and succeeds when complete', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-003', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'INSPECTION',
        subjectId: 'qc-insp-003',
      });
    });

    // Attempting to finalize with finish: 'painted' but missing paint_code and dry_film_microns fails
    await expect(
      submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
        instanceId: instance.instanceId,
        expectedVersion: 1,
        answers: { finish: 'painted' },
      })
    ).rejects.toThrow(/Submission finalization failed/);

    // Complete finalization succeeds and normalizes stale hidden fields
    const finalRes = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: {
        finish: 'raw',
        paint_code: 'STALE_OLD_PAINT_CODE_SHOULD_BE_DROPPED',
        dry_film_microns: '45.5',
      },
    });

    expect(finalRes.submissionId).toBeDefined();
    expect(finalRes.version).toBe(2);

    const reloaded = await submissionService.getInstance(fixture.alpha.users.qc.principal, instance.instanceId);
    expect(reloaded.instance.status).toBe('SUBMITTED');
    expect(reloaded.latestSubmission?.status).toBe('FINAL');
    expect(reloaded.latestSubmission?.answers.finish).toBe('raw');
    expect(reloaded.latestSubmission?.answers.dry_film_microns).toBe('45.5');
    expect(reloaded.latestSubmission?.answers.paint_code).toBeUndefined();
  });

  it('rejects references that are not active records in the current workspace', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-invalid-reference', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: versionId,
      subjectType: 'INSPECTION',
      subjectId: 'qc-insp-invalid-reference',
    }));

    await expect(submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: {
        finish: 'raw',
        dry_film_microns: '30.0',
        machine_reference: 'missing-machine',
      },
    })).rejects.toThrow(/Reference for 'Inspection machine' is unavailable/i);
    expect(await fixture.db.formInstance.findUniqueOrThrow({ where: { id: instance.instanceId } }))
      .toMatchObject({ status: 'PENDING', version: 1 });
  });

  it('serializes competing finalizations and replays an idempotent result once', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-finalize-race', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: versionId,
      subjectType: 'INSPECTION',
      subjectId: 'qc-insp-finalize-race',
    }));
    const answers = { finish: 'raw', dry_film_microns: '45.5' };

    const competing = await Promise.allSettled([
      submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
        instanceId: instance.instanceId, expectedVersion: 1, answers,
      }, 'qc-finalize-race-a'),
      submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
        instanceId: instance.instanceId, expectedVersion: 1, answers,
      }, 'qc-finalize-race-b'),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const winnerKey = competing[0].status === 'fulfilled' ? 'qc-finalize-race-a' : 'qc-finalize-race-b';
    const winner = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId, expectedVersion: 1, answers,
    }, winnerKey);
    const submissionsBeforeReplay = await fixture.db.formSubmission.count({ where: { instanceId: instance.instanceId } });
    const replay = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId, expectedVersion: 1, answers,
    }, winnerKey);
    expect(replay).toEqual(winner);
    expect(await fixture.db.formSubmission.count({ where: { instanceId: instance.instanceId } })).toBe(submissionsBeforeReplay);
    await expect(submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: { finish: 'painted', paint_code: 'RAL-9001', dry_film_microns: '45.5' },
    }, winnerKey)).rejects.toThrow(/different request payload/i);
  });

  it('records the authenticated principal when a caller forges an actor field', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-forged-actor', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: fixture.alpha.workspaceId,
      formVersionId: versionId,
      subjectType: 'INSPECTION',
      subjectId: 'qc-insp-forged-actor',
    }));

    const result = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: { finish: 'raw', dry_film_microns: '45.5' },
      actorId: fixture.alpha.users.owner.userId,
    } as Parameters<typeof submissionService.finalizeSubmission>[1]);

    await expect(fixture.db.formSubmission.findUniqueOrThrow({ where: { id: result.submissionId } }))
      .resolves.toMatchObject({ actorId: fixture.alpha.users.qc.userId });
  });

  it('creates an authorized correction with mandatory reason, preserving supersedes link', async () => {
    await fixture.db.inspection.create({ data: { id: 'qc-insp-004', workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });
    const instance = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: versionId,
        subjectType: 'INSPECTION',
        subjectId: 'qc-insp-004',
      });
    });

    // Initial finalization
    const initialFinal = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 1,
      answers: {
        finish: 'raw',
        dry_film_microns: '30.0',
      },
    });

    // Correction without reason fails
    await expect(
      submissionService.createCorrection(fixture.alpha.users.qc.principal, {
        instanceId: instance.instanceId,
        expectedVersion: 2,
        reason: '   ',
        answers: { finish: 'raw', dry_film_microns: '35.0' },
      })
    ).rejects.toThrow(/Correction reason is mandatory/);

    // Valid correction succeeds and links supersedesId
    const correctionRes = await submissionService.createCorrection(fixture.alpha.users.qc.principal, {
      instanceId: instance.instanceId,
      expectedVersion: 2,
      reason: 'Recalibrated gauge measurement after second pass',
      answers: { finish: 'raw', dry_film_microns: '35.0' },
    });

    expect(correctionRes.submissionId).toBeDefined();
    expect(correctionRes.version).toBe(3);

    const reloaded = await submissionService.getInstance(fixture.alpha.users.qc.principal, instance.instanceId);
    expect(reloaded.latestSubmission?.sequenceNumber).toBe(2);
    expect(reloaded.latestSubmission?.answers.dry_film_microns).toBe('35.0');
    expect(reloaded.latestSubmission?.supersedesId).toBe(initialFinal.submissionId);
    expect(reloaded.latestSubmission?.correctionReason).toBe(
      'Recalibrated gauge measurement after second pass'
    );
  });
});
