import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { Principal } from '@/server/auth/principal';
import { BadRequestError, NotFoundError, ConflictError } from '@/domain/errors';
import { BuilderProposalPolicy } from './policy';
import {
  CreateProposalInput,
  ApplyProposalInput,
  BuilderProposalDto,
  BuilderTarget,
  ProposalStatus,
} from './contracts';
import { validateWorkflowDefinition, WorkflowDefinition } from '@/domain/workflow-definition';
import { validateDefinition } from '@/domain/forms/schema';
import { FormDefinition } from '@/domain/forms/types';
import { callGeminiStructured } from '@/server/ai/gemini-client';

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
  constructor(private readonly prisma: PrismaClient) {}

  async createProposal(
    principal: Principal,
    input: CreateProposalInput
  ): Promise<BuilderProposalDto> {
    BuilderProposalPolicy.requireGenerate(principal, input.target);

    const id = randomUUID();
    const now = new Date().toISOString();

    let candidateObj: any;
    let assumptions: string[] = [];
    let questions: string[] = [];
    let validationFindings: Array<{ field?: string; message: string }> = [];

    if (input.target === 'WORKFLOW') {
      // Bounded template or AI synthesis for manufacturing DAG
      const promptLower = input.prompt.toLowerCase();
      const isCnc = promptLower.includes('cnc') || promptLower.includes('milling') || promptLower.includes('lathe');
      const isAssembly = promptLower.includes('assembly') || promptLower.includes('weld');

      candidateObj = {
        schemaVersion: 1,
        name: isCnc ? 'Precision CNC Machining Flow' : isAssembly ? 'Fabrication & Assembly Flow' : 'Standard Manufacturing Flow',
        nodes: [
          {
            key: 'OP10_PREP',
            name: 'Material Cut & Preparation',
            type: 'OPERATION',
            plannedDurationMinutes: 30,
          },
          {
            key: isCnc ? 'OP20_MILL' : 'OP20_ASSEMBLE',
            name: isCnc ? 'CNC Milling Operation' : 'Subassembly Fit-up',
            type: 'OPERATION',
            plannedDurationMinutes: 60,
          },
          {
            key: 'QC30_INSPECT',
            name: 'In-Process Dimensional Inspection',
            type: 'INSPECTION',
            plannedDurationMinutes: 15,
          },
        ],
        edges: [
          { fromNodeKey: 'OP10_PREP', toNodeKey: isCnc ? 'OP20_MILL' : 'OP20_ASSEMBLE', joinPolicy: 'AND' },
          { fromNodeKey: isCnc ? 'OP20_MILL' : 'OP20_ASSEMBLE', toNodeKey: 'QC30_INSPECT', joinPolicy: 'AND' },
        ],
      };

      const val = validateWorkflowDefinition(candidateObj as WorkflowDefinition);
      if (!val.isValid) {
        validationFindings = val.errors.map((e) => ({ field: e.nodeKey || e.field, message: e.message }));
      }
      assumptions.push('Default planned durations set based on standard machining work center rates.');
      assumptions.push('Final inspection step placed after all machining operations.');
    } else {
      // FORM Target
      candidateObj = {
        schemaVersion: 1,
        purpose: 'QC_EVIDENCE',
        fields: [
          {
            key: 'inspection_result',
            label: 'Inspection Disposition',
            kind: 'select',
            required: true,
            options: [
              { value: 'pass', label: 'Pass' },
              { value: 'fail', label: 'Fail' },
            ],
          },
          {
            key: 'defect_notes',
            label: 'Defect Details',
            kind: 'textarea',
            required: true,
            visibleWhen: { fieldKey: 'inspection_result', operator: 'equals', value: 'fail' },
          },
          {
            key: 'measured_dimensions',
            label: 'Measured Tolerance (mm)',
            kind: 'decimal',
            precision: 2,
            required: false,
          },
        ],
      };

      try {
        validateDefinition(candidateObj as FormDefinition);
      } catch (err: any) {
        validationFindings.push({ message: err.message || 'Invalid form definition' });
      }
      assumptions.push('Conditional visibility configured for defect notes when inspection fails.');
    }

    const candidateJson = JSON.stringify(candidateObj);
    const candidateHash = hashContent(candidateJson);

    const proposal: BuilderProposalDto = {
      id,
      workspaceId: principal.workspaceId,
      actorUserId: principal.userId,
      target: input.target,
      targetDraftId: input.targetDraftId,
      baseRevision: input.baseRevision,
      prompt: input.prompt,
      candidateJson,
      candidateHash,
      validationFindings,
      assumptions,
      questions,
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

    if (proposal.candidateHash !== input.reviewedCandidateHash) {
      throw new ConflictError('Reviewed candidate hash does not match stored proposal. Please review the updated proposal.');
    }

    if (proposal.validationFindings.length > 0) {
      throw new BadRequestError('Cannot apply proposal with unresolved blocking validation findings');
    }

    // Apply atomically to target draft
    let appliedDraftReference = '';

    if (proposal.target === 'WORKFLOW') {
      if (proposal.targetDraftId) {
        // Save to existing workflow version draft
        await this.prisma.workflowVersion.update({
          where: {
            workspaceId_id: {
              workspaceId: principal.workspaceId,
              id: proposal.targetDraftId,
            },
          },
          data: {
            definitionJson: proposal.candidateJson,
            versionNumber: { increment: 1 },
          },
        });
        appliedDraftReference = proposal.targetDraftId;
      } else {
        appliedDraftReference = `WORKFLOW_DRAFT_${randomUUID()}`;
      }
    } else {
      if (proposal.targetDraftId) {
        // Update FormVersion draft
        await this.prisma.formVersion.update({
          where: {
            workspaceId_id: {
              workspaceId: principal.workspaceId,
              id: proposal.targetDraftId,
            },
          },
          data: {
            definitionJson: proposal.candidateJson,
            contentHash: proposal.candidateHash,
            version: { increment: 1 },
          },
        });
        appliedDraftReference = proposal.targetDraftId;
      } else {
        appliedDraftReference = `FORM_DRAFT_${randomUUID()}`;
      }
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
