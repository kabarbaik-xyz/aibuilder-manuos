import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '../../src/server/modules/forms/service';
import { FormSubmissionService } from '../../src/server/modules/forms/submissions';
import { FormDefinition } from '../../src/domain/forms/types';

describe('DF06: Form History, Intelligence Read Model & Audit Provenance', () => {
  let fixture: FactoryFixture;
  let formService: FormService;
  let submissionService: FormSubmissionService;
  let templateId: string;
  let version1Id: string;
  let version2Id: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    formService = new FormService(fixture.db);
    submissionService = new FormSubmissionService(fixture.db);

    // 1. Create Form Template v1
    const tpl = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'QC_COATING_HIST',
      name: 'Coating Quality History Form',
      purpose: 'QC_EVIDENCE',
    });
    templateId = tpl.templateId;
    version1Id = tpl.versionId;

    const defV1: FormDefinition = {
      schemaVersion: 1,
      purpose: 'QC_EVIDENCE',
      fields: [
        {
          key: 'coating_type',
          label: 'Coating Type',
          kind: 'select',
          required: true,
          options: [
            { value: 'powder', label: 'Powder Coat' },
            { value: 'anodize', label: 'Anodized' },
          ],
        },
        {
          key: 'thickness_um',
          label: 'Thickness (um)',
          kind: 'decimal',
          precision: 1,
          required: true,
        },
      ],
    };

    await formService.updateDraftVersion(fixture.alpha.users.owner.principal, templateId, version1Id, {
      expectedVersion: 1,
      definition: defV1,
    });

    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId,
      versionId: version1Id,
      expectedVersion: 2,
    });

    // 2. Fork and publish v2
    const v2 = await formService.forkVersion(fixture.alpha.users.owner.principal, templateId, version1Id);
    version2Id = v2.versionId;

    const defV2: FormDefinition = {
      ...defV1,
      fields: [
        ...defV1.fields,
        {
          key: 'baking_temp_c',
          label: 'Baking Temperature (°C)',
          kind: 'decimal',
          precision: 0,
          required: false,
        },
      ],
    };

    await formService.updateDraftVersion(fixture.alpha.users.owner.principal, templateId, version2Id, {
      expectedVersion: 1,
      definition: defV2,
    });

    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId,
      versionId: version2Id,
      expectedVersion: 2,
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('preserves pinned v1 instance evidence even after v2 is published and used', async () => {
    const subjectV1 = '00000000-0000-0000-0000-000000000010';
    const subjectV2 = '00000000-0000-0000-0000-000000000020';
    await fixture.db.inspection.createMany({ data: [subjectV1, subjectV2].map((id) => ({ id, workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId })) });

    // Create and finalize instance pinned to v1
    const { instanceId: inst1Id } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: version1Id,
        subjectType: 'INSPECTION',
        subjectId: subjectV1,
      });
    });

    await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: inst1Id,
      expectedVersion: 1,
      answers: {
        coating_type: 'powder',
        thickness_um: '65.2',
      },
    });

    // Create and finalize instance pinned to v2
    const { instanceId: inst2Id } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: version2Id,
        subjectType: 'INSPECTION',
        subjectId: subjectV2,
      });
    });

    await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId: inst2Id,
      expectedVersion: 1,
      answers: {
        coating_type: 'anodize',
        thickness_um: '25.0',
        baking_temp_c: '180',
      },
    });

    // Query both instances
    const retrieved1 = await submissionService.getInstance(fixture.alpha.users.qc.principal, inst1Id);
    const retrieved2 = await submissionService.getInstance(fixture.alpha.users.qc.principal, inst2Id);

    expect(retrieved1.instance.formVersionId).toBe(version1Id);
    expect(retrieved1.latestSubmission?.answers).toEqual({
      coating_type: 'powder',
      thickness_um: '65.2',
    });

    expect(retrieved2.instance.formVersionId).toBe(version2Id);
    expect(retrieved2.latestSubmission?.answers).toEqual({
      coating_type: 'anodize',
      thickness_um: '25.0',
      baking_temp_c: '180',
    });
  });

  it('records correction audit chain without mutating prior historical submission', async () => {
    const subjectId = '00000000-0000-0000-0000-000000000030';
    await fixture.db.inspection.create({ data: { id: subjectId, workspaceId: fixture.alpha.workspaceId, sourceType: 'PRODUCTION_OUTPUT', inspectedAtoms: 1n, inspectorUserId: fixture.alpha.users.qc.userId } });

    const { instanceId } = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: version1Id,
        subjectType: 'INSPECTION',
        subjectId,
      });
    });

    // Initial submission
    const initial = await submissionService.finalizeSubmission(fixture.alpha.users.qc.principal, {
      instanceId,
      expectedVersion: 1,
      answers: {
        coating_type: 'powder',
        thickness_um: '40.0',
      },
    });

    // Create Correction
    const corrected = await submissionService.createCorrection(fixture.alpha.users.owner.principal, {
      instanceId,
      expectedVersion: 2,
      reason: 'Calibrated eddy-current gauge showed 42.5 um, correcting preliminary record',
      answers: {
        coating_type: 'powder',
        thickness_um: '42.5',
      },
    });

    expect(corrected.submissionId).toBeDefined();
    expect(corrected.version).toBe(3);

    // Verify all submissions retained in DB
    const allSubmissions = await fixture.db.formSubmission.findMany({
      where: { instanceId },
      orderBy: { sequenceNumber: 'asc' },
    });

    expect(allSubmissions).toHaveLength(2);
    expect(allSubmissions[0].sequenceNumber).toBe(1);
    expect(JSON.parse(allSubmissions[0].answersJson)).toEqual({
      coating_type: 'powder',
      thickness_um: '40.0',
    });

    expect(allSubmissions[1].sequenceNumber).toBe(2);
    expect(allSubmissions[1].supersedesId).toBe(initial.submissionId);
    expect(allSubmissions[1].correctionReason).toContain('Calibrated eddy-current gauge');
    expect(JSON.parse(allSubmissions[1].answersJson)).toEqual({
      coating_type: 'powder',
      thickness_um: '42.5',
    });
  });
});
