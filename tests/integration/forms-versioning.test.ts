import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { FormService } from '../../src/server/modules/forms/service';
import { FormDefinition } from '../../src/domain/forms/types';

describe('DF02: Form Versioning, Publication Lifecycle, and Pinned Instances', () => {
  let fixture: FactoryFixture;
  let formService: FormService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    formService = new FormService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('creates a form template and initializes DRAFT version 1 with default notes', async () => {
    const res = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'QC_PAINT_INSPECT',
      name: 'QC Paint Inspection Form',
      purpose: 'QC_EVIDENCE',
      description: 'Coating thickness and gloss inspection',
    });

    expect(res.templateId).toBeDefined();
    expect(res.versionId).toBeDefined();

    const tpl = await formService.getTemplate(fixture.alpha.users.owner.principal, res.templateId);
    expect(tpl.code).toBe('QC_PAINT_INSPECT');
    expect(tpl.versionsCount).toBe(1);
    expect(tpl.versions[0].versionNumber).toBe(1);
    expect(tpl.versions[0].status).toBe('DRAFT');
  });

  it('replays template creation and version forks without creating duplicates', async () => {
    const input = {
      code: 'IDEMPOTENT_FORM_CREATE',
      name: 'Idempotent form create',
      purpose: 'ORDER_SPEC' as const,
    };
    const created = await formService.createTemplate(fixture.alpha.users.owner.principal, input, 'form-create-replay');
    const replayed = await formService.createTemplate(fixture.alpha.users.owner.principal, input, 'form-create-replay');
    expect(replayed).toEqual(created);
    expect(await fixture.db.formTemplate.count({ where: { workspaceId: fixture.alpha.workspaceId, code: input.code } })).toBe(1);

    const forked = await formService.forkVersion(fixture.alpha.users.owner.principal, created.templateId, created.versionId, 'form-fork-replay');
    const forkReplay = await formService.forkVersion(fixture.alpha.users.owner.principal, created.templateId, created.versionId, 'form-fork-replay');
    expect(forkReplay).toEqual(forked);
    expect(await fixture.db.formVersion.count({ where: { templateId: created.templateId } })).toBe(2);
  });

  it('updates draft version with a valid definition and enforces optimistic version check', async () => {
    const created = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'TASK_WELD_EVIDENCE',
      name: 'Welding Execution Evidence',
      purpose: 'TASK_EVIDENCE',
    });

    const v1Definition: FormDefinition = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        {
          key: 'weld_pass_count',
          label: 'Pass Count',
          kind: 'decimal',
          precision: 0,
          required: true,
        },
        {
          key: 'welder_initials',
          label: 'Welder Initials',
          kind: 'text',
          maxLength: 10,
          required: true,
        },
      ],
    };

    // Stale version update fails
    await expect(
      formService.updateDraftVersion(fixture.alpha.users.owner.principal, created.templateId, created.versionId, {
        expectedVersion: 999,
        definition: v1Definition,
      })
    ).rejects.toThrow(/Version conflict/);

    // Valid update succeeds
    const updated = await formService.updateDraftVersion(
      fixture.alpha.users.owner.principal,
      created.templateId,
      created.versionId,
      {
        expectedVersion: 1,
        definition: v1Definition,
      }
    );

    expect(updated.version).toBe(2);

    const reloaded = await formService.getTemplate(fixture.alpha.users.owner.principal, created.templateId);
    expect(reloaded.versions[0].definition.fields).toHaveLength(2);
  });

  it('publishes version 1, freezes contentHash, and renders published version immutable', async () => {
    const created = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'ORDER_SPEC_PANEL',
      name: 'Control Panel Custom Specs',
      purpose: 'ORDER_SPEC',
    });

    // Publish v1
    const pubRes = await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: created.templateId,
      versionId: created.versionId,
      expectedVersion: 1,
    });

    expect(pubRes.hash).toBeDefined();

    // Trying to edit a PUBLISHED version must fail
    await expect(
      formService.updateDraftVersion(fixture.alpha.users.owner.principal, created.templateId, created.versionId, {
        expectedVersion: 2,
        definition: {
          schemaVersion: 1,
          purpose: 'ORDER_SPEC',
          fields: [{ key: 'hacked_field', label: 'Hacked', kind: 'text', required: false }],
        },
      })
    ).rejects.toThrow(/is immutable/);

    // Can fork into v2 DRAFT
    const forked = await formService.forkVersion(
      fixture.alpha.users.owner.principal,
      created.templateId,
      created.versionId
    );

    expect(forked.versionNumber).toBe(2);

    const reloaded = await formService.getTemplate(fixture.alpha.users.owner.principal, created.templateId);
    expect(reloaded.versions).toHaveLength(2);
    expect(reloaded.versions.find((v) => v.versionNumber === 1)?.status).toBe('PUBLISHED');
    expect(reloaded.versions.find((v) => v.versionNumber === 2)?.status).toBe('DRAFT');
  });

  it('allows only one concurrent publication of the same draft version', async () => {
    const created = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'CONCURRENT_FORM_PUBLISH',
      name: 'Concurrent form publication',
      purpose: 'ORDER_SPEC',
    });

    const formVersionDelegate = fixture.db.formVersion as any;
    const originalFindFirst = formVersionDelegate.findFirst;
    let readers = 0;
    let releaseReaders!: () => void;
    const bothReadDraft = new Promise<void>((resolve) => { releaseReaders = resolve; });
    formVersionDelegate.findFirst = async (args: any) => {
      const version = await originalFindFirst(args);
      if (args?.where && 'id' in args.where && args.where.id === created.versionId) {
        readers += 1;
        if (readers === 2) releaseReaders();
        await bothReadDraft;
      }
      return version;
    };

    try {
      const results = await Promise.allSettled([
        formService.publishFormVersion(fixture.alpha.users.owner.principal, {
          templateId: created.templateId,
          versionId: created.versionId,
          expectedVersion: 1,
        }),
        formService.publishFormVersion(fixture.alpha.users.owner.principal, {
          templateId: created.templateId,
          versionId: created.versionId,
          expectedVersion: 1,
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      await expect(formService.getTemplate(fixture.alpha.users.owner.principal, created.templateId))
        .resolves.toMatchObject({ versions: [expect.objectContaining({ status: 'PUBLISHED', version: 2 })] });
    } finally {
      formVersionDelegate.findFirst = originalFindFirst;
    }
  });

  it('proves publishing v2 cannot alter an existing instance pinned to v1', async () => {
    const created = await formService.createTemplate(fixture.alpha.users.owner.principal, {
      code: 'PINNED_VERSION_TEST',
      name: 'Pinned Version Verification Form',
      purpose: 'TASK_EVIDENCE',
    });

    const v1Definition: FormDefinition = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [{ key: 'v1_metric', label: 'V1 Metric', kind: 'decimal', required: true }],
    };

    await formService.updateDraftVersion(fixture.alpha.users.owner.principal, created.templateId, created.versionId, {
      expectedVersion: 1,
      definition: v1Definition,
    });

    const v1Pub = await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: created.templateId,
      versionId: created.versionId,
      expectedVersion: 2,
    });

    // Create an instance pinned to v1
    const testTaskId = 'dummy-task-001';
    const instanceV1 = await fixture.db.$transaction(async (tx) => {
      return formService.createFormInstance(tx, {
        workspaceId: fixture.alpha.workspaceId,
        formVersionId: created.versionId,
        subjectType: 'TASK',
        subjectId: testTaskId,
      });
    });

    expect(instanceV1.instanceId).toBeDefined();

    // Fork v2 and publish it with changed fields
    const forked = await formService.forkVersion(
      fixture.alpha.users.owner.principal,
      created.templateId,
      created.versionId
    );

    const v2Definition: FormDefinition = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        { key: 'v1_metric', label: 'V1 Metric', kind: 'decimal', required: true },
        { key: 'v2_new_metric', label: 'V2 New Metric', kind: 'text', required: true },
      ],
    };

    await formService.updateDraftVersion(fixture.alpha.users.owner.principal, created.templateId, forked.versionId, {
      expectedVersion: 1,
      definition: v2Definition,
    });

    await formService.publishFormVersion(fixture.alpha.users.owner.principal, {
      templateId: created.templateId,
      versionId: forked.versionId,
      expectedVersion: 2,
    });

    // Inspect the existing instance: it MUST still point strictly to v1
    const fetchedInstance = await fixture.db.formInstance.findUnique({
      where: { id: instanceV1.instanceId },
      include: { formVersion: true },
    });

    expect(fetchedInstance?.formVersionId).toBe(created.versionId);
    expect(fetchedInstance?.formVersion.versionNumber).toBe(1);
    expect(fetchedInstance?.formVersion.contentHash).toBe(v1Pub.hash);
    expect(JSON.parse(fetchedInstance!.formVersion.definitionJson).fields).toHaveLength(1);
  });
});
