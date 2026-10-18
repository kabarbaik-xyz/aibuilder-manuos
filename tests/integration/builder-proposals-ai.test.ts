import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { BuilderProposalService } from '@/server/modules/builder-proposals/service';
import { FormService } from '@/server/modules/forms/service';
import { WorkflowService } from '@/server/modules/workflow/service';

describe('AI builder generation uses provider output and scoped draft evidence', () => {
  let fixture: FactoryFixture;
  beforeAll(async () => { fixture = await createFactoryFixture(); });
  afterAll(async () => { await fixture.close(); });
  const form = { schemaVersion: 1, purpose: 'TASK_EVIDENCE', fields: [{ key: 'safety_check', label: 'Guard inspection', kind: 'boolean', required: true }] };
  const reply = (definition: unknown) => ({ aiResult: { definitionJson: JSON.stringify(definition), assumptions: ['Review this proposed check.'], questions: [] } });

  it('uses the actual generated fields and preserves the target purpose', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const draft = await new FormService(fixture.db).createTemplate(principal, { code: 'REAL-AI-TASK', name: 'Task check', purpose: 'TASK_EVIDENCE' });
    const generate = vi.fn().mockResolvedValue(reply(form));
    const proposal = await new BuilderProposalService(fixture.db, generate).createProposal(principal, { target: 'FORM', targetDraftId: draft.versionId, baseRevision: 1, prompt: 'A required guard inspection checkbox' });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toContain('TASK_EVIDENCE');
    expect(generate.mock.calls[0][0]).toContain('A required guard inspection checkbox');
    expect(JSON.parse(proposal.candidateJson)).toEqual(form);
    expect(proposal.validationFindings).toEqual([]);
  });

  it('fails clearly on provider failure instead of returning a canned candidate', async () => {
    const generate = vi.fn().mockResolvedValue({ aiResult: null, reason: 'timeout' });
    await expect(new BuilderProposalService(fixture.db, generate).createProposal(fixture.alpha.users.owner.principal, { target: 'FORM', prompt: 'Any form' })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
  });

  it('blocks a generated form whose purpose differs from its target draft', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const draft = await new FormService(fixture.db).createTemplate(principal, { code: 'REAL-AI-PURPOSE', name: 'Task purpose', purpose: 'TASK_EVIDENCE' });
    const generate = vi.fn().mockResolvedValue(reply({ ...form, purpose: 'QC_EVIDENCE' }));
    const proposal = await new BuilderProposalService(fixture.db, generate).createProposal(principal, { target: 'FORM', targetDraftId: draft.versionId, prompt: 'Task evidence' });
    expect(proposal.validationFindings).toContainEqual(expect.objectContaining({ field: 'purpose' }));
    await expect(new BuilderProposalService(fixture.db, generate).applyProposal(principal, proposal.id, { expectedTargetRevision: 1, reviewedCandidateHash: proposal.candidateHash, humanAcknowledgment: true, idempotencyKey: 'wrong-purpose-ai' })).rejects.toThrow('blocking validation');
  });

  it('rejects another workspace draft before calling the provider', async () => {
    const draft = await new FormService(fixture.db).createTemplate(fixture.beta.users.owner.principal, { code: 'REAL-AI-OTHER', name: 'Other task', purpose: 'TASK_EVIDENCE' });
    const generate = vi.fn().mockResolvedValue(reply(form));
    await expect(new BuilderProposalService(fixture.db, generate).createProposal(fixture.alpha.users.owner.principal, { target: 'FORM', targetDraftId: draft.versionId, prompt: 'Read this draft' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates and applies a lifecycle through the lifecycle draft command', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const workflow = await new WorkflowService(fixture.db).createTemplate(principal, { orderTypeId: fixture.alpha.masters.orderTypeId, kind: 'ORDER_LIFECYCLE', code: 'REAL-AI-LIFECYCLE', name: 'AI lifecycle' }, 'ai-life-create');
    const versionId = workflow.data.initialVersionId!;
    const candidate = { schemaVersion: 1, name: 'Review customer evidence', stages: [{ key: 'REVIEW', name: 'Review order evidence', action: 'REVIEW_EVIDENCE', departmentId: fixture.alpha.masters.departmentId, assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: fixture.alpha.masters.departmentId, eligibleRoleCodes: ['OWNER'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 120 }, predecessors: [], forms: [] }] };
    const generate = vi.fn().mockResolvedValue(reply(candidate));
    const otherDepartment = await fixture.db.department.create({ data: { workspaceId: fixture.beta.workspaceId, code: 'OTHER-AI-DEPT', name: 'Other workspace engineering' } });
    const service = new BuilderProposalService(fixture.db, generate);
    const proposal = await service.createProposal(principal, { target: 'LIFECYCLE', targetDraftId: versionId, baseRevision: 1, prompt: 'An order evidence review stage' });
    expect(proposal.validationFindings).toEqual([]);
    expect(generate.mock.calls[0][0]).toContain(fixture.alpha.masters.departmentId);
    expect(generate.mock.calls[0][0]).not.toContain(otherDepartment.id);
    await service.applyProposal(principal, proposal.id, { expectedTargetRevision: 1, reviewedCandidateHash: proposal.candidateHash, humanAcknowledgment: true, idempotencyKey: 'ai-life-apply' });
    const saved = await fixture.db.workflowVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(JSON.parse(saved.definitionJson)).toEqual(candidate);
    expect(saved.version).toBe(2);
  });

  it('rejects stale generation revisions without calling the provider', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const draft = await new FormService(fixture.db).createTemplate(principal, { code: 'AI-STALE-GENERATE', name: 'Current revision', purpose: 'TASK_EVIDENCE' });
    const generate = vi.fn().mockResolvedValue(reply(form));
    await expect(new BuilderProposalService(fixture.db, generate).createProposal(principal, { target: 'FORM', targetDraftId: draft.versionId, baseRevision: 2, prompt: 'Update check' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('denies planner-only generation even when a role name claims owner', async () => {
    const principal = { ...fixture.alpha.users.owner.principal, permissions: new Set(['planning.write']) };
    const generate = vi.fn().mockResolvedValue(reply(form));
    await expect(new BuilderProposalService(fixture.db, generate).createProposal(principal, { target: 'WORKFLOW', prompt: 'A route' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects malformed model responses with a recoverable response error', async () => {
    const generate = vi.fn().mockResolvedValue({ aiResult: { definitionJson: 'not JSON', assumptions: [], questions: [] } });
    await expect(new BuilderProposalService(fixture.db, generate).createProposal(fixture.alpha.users.owner.principal, { target: 'FORM', prompt: 'A form' })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', statusCode: 502 });
  });

  it('returns blocking findings for unavailable lifecycle references', async () => {
    const generate = vi.fn().mockResolvedValue(reply({ schemaVersion: 1, name: 'Unavailable owner', stages: [{ key: 'REVIEW', name: 'Review', action: 'REVIEW_EVIDENCE', departmentId: 'invented-department', assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: 'invented-department', eligibleRoleCodes: ['OWNER'] }, schedule: { kind: 'DEADLINE', dueAfterMinutes: 60 }, predecessors: [], forms: [] }] }));
    const proposal = await new BuilderProposalService(fixture.db, generate).createProposal(fixture.alpha.users.owner.principal, { target: 'LIFECYCLE', prompt: 'Order review' });
    expect(proposal.validationFindings).toContainEqual(expect.objectContaining({ message: expect.stringContaining('unavailable department') }));
  });
});
