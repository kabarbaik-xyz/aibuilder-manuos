export interface LifecycleVersionActions {
  canEdit: boolean;
  canSubmitReview: boolean;
  canPublish: boolean;
  canFork: boolean;
  canRetire: boolean;
}

export function lifecycleVersionActions(status: string): LifecycleVersionActions {
  return {
    canEdit: status === 'DRAFT',
    canSubmitReview: status === 'DRAFT',
    canPublish: status === 'DRAFT' || status === 'REVIEW',
    canFork: status === 'PUBLISHED' || status === 'RETIRED',
    canRetire: status === 'PUBLISHED',
  };
}
