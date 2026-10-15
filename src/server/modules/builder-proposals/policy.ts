import { Principal } from '@/server/auth/principal';
import { requireAnyPermission, requirePermission } from '@/server/auth/permissions';
import { ForbiddenError } from '@/domain/errors';
import { BuilderTarget } from './contracts';

export class BuilderProposalPolicy {
  /**
   * Only authorized authors can request AI proposals:
   * - WORKFLOW: engineering.write or workflow permissions or owner
   * - FORM: forms.create or forms.edit_draft or owner
   */
  static requireGenerate(principal: Principal, target: BuilderTarget) {
    if (principal.roles.includes('OWNER') || principal.roles.includes('ACCESS_ADMIN')) {
      return;
    }

    if (target === 'WORKFLOW') {
      requireAnyPermission(principal, ['engineering.write', 'planning.write', 'workflow.create', 'workflow.edit_draft']);
    } else if (target === 'FORM') {
      requireAnyPermission(principal, ['forms.create', 'forms.edit_draft', 'forms.submit_review']);
    } else {
      throw new ForbiddenError('Unauthorized target for AI proposal generation');
    }
  }

  /**
   * Applying an AI draft proposal requires actual create/edit permissions on the target resource.
   */
  static requireApply(principal: Principal, target: BuilderTarget) {
    if (principal.roles.includes('OWNER') || principal.roles.includes('ACCESS_ADMIN')) {
      return;
    }

    if (target === 'WORKFLOW') {
      requireAnyPermission(principal, ['engineering.write', 'workflow.create', 'workflow.edit_draft']);
    } else if (target === 'FORM') {
      requireAnyPermission(principal, ['forms.create', 'forms.edit_draft']);
    } else {
      throw new ForbiddenError('Unauthorized target for proposal application');
    }
  }
}
