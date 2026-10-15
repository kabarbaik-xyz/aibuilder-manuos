import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { BuilderProposalService } from '../../src/server/modules/builder-proposals/service';
import { ConflictError, BadRequestError, ForbiddenError } from '../../src/domain/errors';

describe('WB02: AI Builder Proposals Lifecycle & Domain Authority', () => {
  let fixture: FactoryFixture;
  let service: BuilderProposalService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    service = new BuilderProposalService(fixture.db);
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
    const proposal = await service.createProposal(fixture.alpha.users.owner.principal, {
      target: 'FORM',
      prompt: 'QC Evidence Form for Coating Inspection',
    });

    const res = await service.applyProposal(fixture.alpha.users.owner.principal, proposal.id, {
      expectedTargetRevision: 1,
      reviewedCandidateHash: proposal.candidateHash,
      humanAcknowledgment: true,
      idempotencyKey: 'idemp-003',
    });

    expect(res.status).toBe('APPLIED');
    expect(res.appliedDraftReference).toBeDefined();

    const stored = await service.getProposal(fixture.alpha.users.owner.principal, proposal.id);
    expect(stored.status).toBe('APPLIED');
    expect(stored.appliedDraftReference).toBe(res.appliedDraftReference);
  });
});
