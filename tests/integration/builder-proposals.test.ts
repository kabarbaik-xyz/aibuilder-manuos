import { fixtureBuilderAI } from '../fixtures/builder-ai';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { BuilderProposalService } from '../../src/server/modules/builder-proposals/service';
import { computeDefinitionHash, FormService } from '../../src/server/modules/forms/service';
import { WorkflowService } from '../../src/server/modules/workflow/service';
import { ConflictError, BadRequestError, ForbiddenError } from '../../src/domain/errors';

describe('WB02: AI Builder Proposals Lifecycle & Domain Authority', () => {
  let fixture: FactoryFixture;
  let service: BuilderProposalService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    service = new BuilderProposalService(fixture.db, fixtureBuilderAI);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('generates a valid workflow proposal candidate with assumptions and validation findings', async () => {
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'WORKFLOW',
      prompt: 'Design a high-precision CNC milling process for titanium aerospace brackets',
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.target).toBe('WORKFLOW');
    expect(proposal.status).toBe('GENERATED');
    expect(proposal.candidateHash).toBeDefined();
    expect(proposal.assumptions.length).toBeGreaterThan(0);

    const parsedCandidate = JSON.parse(proposal.candidateJson);
    expect(parsedCandidate.nodes.length).toBeGreaterThan(0);
    expect(parsedCandidate.edges.length).toBeGreaterThan(0);
  });

  it('denies proposal application without explicit human review acknowledgment', async () => {
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'WORKFLOW',
      prompt: 'Assembly pipeline with QA checks',
    });

    await expect(
      service.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
        expectedTargetRevision: 1,
        reviewedCandidateHash: proposal.candidateHash,
        humanAcknowledgment: false,
        idempotencyKey: 'idemp-001',
      } as any)
    ).rejects.toThrow();
  });

  it('rejects proposal application when candidate hash has been modified or does not match', async () => {
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'FORM',
      prompt: 'QC Inspection checklist for paint thickness and gloss',
    });

    await expect(
      service.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
        expectedTargetRevision: 1,
        reviewedCandidateHash: 'forged_or_stale_hash_value',
        humanAcknowledgment: true,
        idempotencyKey: 'idemp-002',
      })
    ).rejects.toThrowError(ConflictError);
  });

  it('successfully applies reviewed proposal and marks status as APPLIED', async () => {
    const draft = await new FormService(fixture.db).createTemplate(fixture.alpha.users.owner.principal, {
      code: 'AI-APPLY-QC', name: 'AI apply QC', purpose: 'QC_EVIDENCE',
    }, 'ai-apply-form-create');
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'FORM',
      prompt: 'QC Evidence Form for Coating Inspection',
      targetDraftId: draft.versionId,
      baseRevision: 1,
    });

    const res = await service.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
      expectedTargetRevision: 1,
      reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true,
      idempotencyKey: 'idemp-003',
    });

    expect(res.status).toBe('APPLIED');
    expect(res.appliedDraftReference).toBe(draft.versionId);
    const savedDraft = await fixture.db.formVersion.findUniqueOrThrow({ where: { id: draft.versionId } });
    expect(savedDraft.version).toBe(2);
    expect(savedDraft.contentHash).toBe(computeDefinitionHash(JSON.parse(savedDraft.definitionJson)));
    expect(JSON.parse(savedDraft.definitionJson)).toEqual(JSON.parse(proposal.candidateJson));
    expect(await fixture.db.commandReceipt.findFirst({ where: { workspaceId: fixture.alpha.workspaceId, key: 'idemp-003', commandType: 'forms.version.update_draft' } })).toBeDefined();

    const stored = await service.getProposal(fixture.alpha.users.owner.principal, proposal.id);
    expect(stored.status).toBe('APPLIED');
    expect(stored.appliedDraftReference).toBe(res.appliedDraftReference);
  });

  it('does not report an applied draft when no persisted target draft was selected', async () => {
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'FORM', prompt: 'QC Inspection checklist for paint thickness',
    });

    await expect(service.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
      expectedTargetRevision: 1, reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true, idempotencyKey: 'ai-apply-without-target',
    })).rejects.toThrow(BadRequestError);
  });

  it('rejects applying against a draft revision changed after proposal generation', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const forms = new FormService(fixture.db);
    const draft = await forms.createTemplate(principal, {
      code: 'AI-STALE-QC', name: 'AI stale QC', purpose: 'QC_EVIDENCE',
    }, 'ai-stale-form-create');
    const proposal = await service.createProposal(principal, {
      target: 'FORM', prompt: 'QC Inspection checklist', targetDraftId: draft.versionId, baseRevision: 1,
    });
    await forms.updateDraftVersion(principal, draft.templateId, draft.versionId, {
      expectedVersion: 1,
      definition: { schemaVersion: 1, purpose: 'QC_EVIDENCE', fields: [{ key: 'notes', label: 'Notes', kind: 'textarea', required: false }] },
    }, 'ai-stale-form-edit');

    await expect(service.applyProposal(principal, proposal.id, {
      expectedTargetRevision: 1, reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true, idempotencyKey: 'ai-stale-form-apply',
    })).rejects.toThrow(ConflictError);
    expect((await service.getProposal(principal, proposal.id)).status).toBe('GENERATED');
  });

  it('applies workflow proposals through catalog validation and the versioned draft command', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const workflow = await new WorkflowService(fixture.db).createTemplate(principal, {
      orderTypeId: fixture.alpha.masters.orderTypeId, code: 'AI-APPLY-ROUTE', name: 'AI apply route', kind: 'PRODUCTION_ROUTING',
    }, 'ai-apply-workflow-create');
    const versionId = workflow.data.initialVersionId!;
    const proposal = await service.createProposal(principal, {
      target: 'WORKFLOW', prompt: 'Design a CNC milling route', targetDraftId: versionId, baseRevision: 1,
    });

    const result = await service.applyProposal(principal, proposal.id, {
      expectedTargetRevision: 1, reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true, idempotencyKey: 'ai-apply-workflow',
    });
    const savedVersion = await fixture.db.workflowVersion.findUniqueOrThrow({ where: { id: versionId }, include: { nodes: true } });
    expect(result.appliedDraftReference).toBe(versionId);
    expect(savedVersion.version).toBe(2);
    expect(savedVersion.nodes.map(node => node.key)).toEqual(expect.arrayContaining(['OP10_PREP', 'OP20_MILL', 'QC30_INSPECT']));
    expect(await fixture.db.commandReceipt.findFirst({ where: { workspaceId: fixture.alpha.workspaceId, key: 'ai-apply-workflow', commandType: 'workflow.version.save_draft' } })).toBeDefined();
  });
});
