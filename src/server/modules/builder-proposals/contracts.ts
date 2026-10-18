import { z } from 'zod';
import { WorkflowDefinition } from '@/domain/workflow-definition';
import { FormDefinition } from '@/domain/forms/types';

export const BuilderTarget = z.enum(['WORKFLOW', 'LIFECYCLE', 'FORM']);
export type BuilderTarget = z.infer<typeof BuilderTarget>;

export const ProposalStatus = z.enum(['GENERATED', 'APPLIED', 'DISCARDED', 'FAILED']);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

export const CreateProposalInputSchema = z.object({
  target: BuilderTarget,
  prompt: z.string().trim().min(1).max(8000),
  targetDraftId: z.string().optional(),
  baseRevision: z.number().int().positive().optional(),
  allowedSourceRecordIds: z.array(z.string()).optional(),
});
export type CreateProposalInput = z.infer<typeof CreateProposalInputSchema>;

export const ApplyProposalInputSchema = z.object({
  expectedTargetRevision: z.number().int().positive(),
  reviewedCandidateHash: z.string().min(1),
  humanAcknowledgment: z.literal(true, {
    errorMap: () => ({ message: 'Explicit human review and acknowledgment is required to apply an AI proposal' }),
  }),
  idempotencyKey: z.string().min(1),
});
export type ApplyProposalInput = z.infer<typeof ApplyProposalInputSchema>;

export interface BuilderProposalDto {
  id: string;
  workspaceId: string;
  actorUserId: string;
  target: BuilderTarget;
  targetDraftId?: string;
  baseRevision?: number;
  prompt: string;
  candidateJson: string;
  candidateHash: string;
  validationFindings: Array<{ field?: string; message: string }>;
  assumptions: string[];
  questions: string[];
  referenceLabels?: Record<string, string>;
  status: ProposalStatus;
  appliedDraftReference?: string;
  createdAt: string;
  updatedAt: string;
}
