import { Principal } from '@/server/auth/principal';
import { requirePermission } from '@/server/auth/permissions';

export class FormPolicy {
  static requireRead(principal: Principal): void {
    requirePermission(principal, 'forms.read');
  }

  static requireCreate(principal: Principal): void {
    requirePermission(principal, 'forms.create');
  }

  static requireEditDraft(principal: Principal): void {
    requirePermission(principal, 'forms.edit_draft');
  }

  static requireSubmitReview(principal: Principal): void {
    requirePermission(principal, 'forms.submit_review');
  }

  static requirePublish(principal: Principal): void {
    requirePermission(principal, 'forms.publish');
  }

  static requireRetire(principal: Principal): void {
    requirePermission(principal, 'forms.retire');
  }

  static requireBind(principal: Principal): void {
    requirePermission(principal, 'forms.bind');
  }

  static requireCorrect(principal: Principal): void {
    requirePermission(principal, 'forms.correct');
  }
}
