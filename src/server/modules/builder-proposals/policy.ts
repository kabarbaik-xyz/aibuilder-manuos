import { Principal } from '@/server/auth/principal';
import { requireAnyPermission, requirePermission } from '@/server/auth/permissions';
import { ForbiddenError } from '@/domain/errors';
import { BuilderTarget } from './contracts';

export class BuilderProposalPolicy {
  /**
   * Only authorized authors can request AI proposals:
   * - WORKFLOW/LIFECYCLE: the same author capability required by Studio
   * - FORM: create or edit-draft capability, never review-only access
   */
  static requireGenerate(principal: Principal, target: BuilderTarget) {
    if (target === 'WORKFLOW' || target === 'LIFECYCLE') {
      requirePermission(principal, 'workflow.author');
    } else if (target === 'FORM') {
      requireAnyPermission(principal, ['forms.create', 'forms.edit_draft']);
    } else {
      throw new ForbiddenError('Unauthorized target for AI proposal generation');
    }
  }

  /**
   * Applying an AI draft proposal requires actual create/edit permissions on the target resource.
   */
  static requireApply(principal: Principal, target: BuilderTarget) {
    if (target === 'WORKFLOW' || target === 'LIFECYCLE') {
      requirePermission(principal, 'workflow.author');
    } else if (target === 'FORM') {
      requirePermission(principal, 'forms.edit_draft');
    } else {
      throw new ForbiddenError('Unauthorized target for proposal application');
    }
  }
}
