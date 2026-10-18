import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, NotFoundError, ConflictError } from '@/domain/errors';
import { BuilderProposalPolicy } from './policy';
import {
  CreateProposalInput,
  ApplyProposalInput,
  BuilderProposalDto,
  ProposalStatus,
} from './contracts';
import { FormDefinition } from '@/domain/forms/types';
import { callGeminiStructured } from '@/server/ai/gemini-client';
import { generateBuilderCandidate } from './generation';
import { WorkflowService } from '@/server/modules/workflow/service';
import { FormService } from '@/server/modules/forms/service';

import fs from 'fs';
import path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __manuos_proposal_store: Map<string, BuilderProposalDto> | undefined;
}

const PROPOSALS_DIR = path.resolve(process.cwd(), 'storage/proposals');

function ensureProposalsDir() {
  try {
    if (!fs.existsSync(PROPOSALS_DIR)) {
      fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
    }
  } catch {
    // Ignore directory creation race conditions
  }
}

function getMemoryStore(): Map<string, BuilderProposalDto> {
  if (!globalThis.__manuos_proposal_store) {
    globalThis.__manuos_proposal_store = new Map<string, BuilderProposalDto>();
  }
  return globalThis.__manuos_proposal_store;
}

function persistProposal(proposal: BuilderProposalDto): void {
  const store = getMemoryStore();
  store.set(proposal.id, proposal);
  try {
    ensureProposalsDir();
    const filePath = path.join(PROPOSALS_DIR, `${proposal.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist proposal to disk:', err);
  }
}

function loadProposal(id: string): BuilderProposalDto | undefined {
  const store = getMemoryStore();
  const cached = store.get(id);
  if (cached) return cached;

  try {
    const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as BuilderProposalDto;
      store.set(id, parsed);
      return parsed;
    }
  } catch (err) {
    console.error(`Failed to load proposal ${id} from disk:`, err);
  }

  return undefined;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export class BuilderProposalService {
  constructor(private readonly prisma: PrismaClient, private readonly generate: typeof callGeminiStructured = callGeminiStructured) {}

  async createProposal(
    principal: Principal,
    input: CreateProposalInput
  ): Promise<BuilderProposalDto> {
    BuilderProposalPolicy.requireGenerate(principal, input.target);

    const id = randomUUID();
    const now = new Date().toISOString();

    const { candidate: candidateObj, assumptions, questions, validationFindings, referenceLabels, baseRevision } =
      await generateBuilderCandidate(this.prisma, principal, input, this.generate);

    const candidateJson = JSON.stringify(candidateObj);
    const candidateHash = hashContent(candidateJson);

    const proposal: BuilderProposalDto = {
      id,
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      target: input.target,
      targetDraftId: input.targetDraftId,
      baseRevision,
      prompt: input.prompt,
      candidateJson,
      candidateHash,
      validationFindings,
      assumptions,
      questions,
      referenceLabels,
      status: 'GENERATED',
      createdAt: now,
      updatedAt: now,
    };

    persistProposal(proposal);
    return proposal;
  }

  async getProposal(principal: Principal, id: string): Promise<BuilderProposalDto> {
    const proposal = loadProposal(id);
    if (!proposal || proposal.workspaceId !== principal.workspaceId) {
      throw new NotFoundError(`AI Builder proposal '${id}' not found`);
    }
    BuilderProposalPolicy.requireGenerate(principal, proposal.target);
    return proposal;
  }

  async applyProposal(
    principal: Principal,
    id: string,
    input: ApplyProposalInput
  ): Promise<{ status: ProposalStatus; appliedDraftReference: string }> {
    const proposal = await this.getProposal(principal, id);

    BuilderProposalPolicy.requireApply(principal, proposal.target);

    if (input.humanAcknowledgment !== true) {
      throw new BadRequestError('Explicit human review and acknowledgment is required to apply an AI proposal');
    }

    if (proposal.status !== 'GENERATED') {
      throw new BadRequestError(`Cannot apply proposal in status '${proposal.status}'`);
    }

    if (hashContent(proposal.candidateJson) !== proposal.candidateHash || proposal.candidateHash !== input.reviewedCandidateHash) {
      throw new ConflictError('Reviewed candidate hash does not match stored proposal. Please review the updated proposal.');
    }

    if (proposal.validationFindings.length > 0) {
      throw new BadRequestError('Cannot apply proposal with unresolved blocking validation findings');
    }

    if (!proposal.targetDraftId) {
      throw new BadRequestError('Select an existing draft in Workflow Studio or Form Builder before applying this proposal.');
    }
    if (proposal.baseRevision !== undefined && proposal.baseRevision !== input.expectedTargetRevision) {
      throw new ConflictError('Reviewed target revision does not match the revision used to generate this proposal.');
    }

    // Apply atomically to target draft
    let appliedDraftReference = '';

    if (proposal.target === 'WORKFLOW' || proposal.target === 'LIFECYCLE') {
      const target = await this.prisma.workflowVersion.findFirst({ where: { id: proposal.targetDraftId, workspaceId: principal.workspaceId }, select: { template: { select: { kind: true } } } });
      if (!target) throw new NotFoundError('Selected workflow draft was not found.');
      if ((proposal.target === 'LIFECYCLE') !== (target.template.kind === 'ORDER_LIFECYCLE')) throw new BadRequestError('AI proposal does not match this workflow kind.');
      await new WorkflowService(this.prisma).saveVersionDraft(principal, proposal.targetDraftId, {
        expectedVersion: input.expectedTargetRevision,
        definition: JSON.parse(proposal.candidateJson),
      }, input.idempotencyKey);
      appliedDraftReference = proposal.targetDraftId;
    } else {
      const target = await this.prisma.formVersion.findFirst({
        where: { id: proposal.targetDraftId, workspaceId: principal.workspaceId },
        select: { templateId: true, template: { select: { purpose: true } } },
      });
      if (!target) throw new NotFoundError(`Form draft '${proposal.targetDraftId}' not found`);
      if ((JSON.parse(proposal.candidateJson) as FormDefinition).purpose !== target.template.purpose) throw new BadRequestError('Generated form purpose does not match the selected template.');
      await new FormService(this.prisma).updateDraftVersion(principal, target.templateId, proposal.targetDraftId, {
        expectedVersion: input.expectedTargetRevision,
        definition: JSON.parse(proposal.candidateJson) as FormDefinition,
      }, input.idempotencyKey);
      appliedDraftReference = proposal.targetDraftId;
    }

    proposal.status = 'APPLIED';
    proposal.appliedDraftReference = appliedDraftReference;
    proposal.updatedAt = new Date().toISOString();
    persistProposal(proposal);

    return {
      status: 'APPLIED',
      appliedDraftReference,
    };
  }
}
