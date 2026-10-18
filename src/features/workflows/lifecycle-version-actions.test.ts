import { describe, expect, it } from 'vitest';
import { lifecycleVersionActions } from './lifecycle-version-actions';

describe('lifecycle version actions', () => {
  it('lets authors edit and submit drafts, lets reviewers publish, and keeps published versions read-only', () => {
    expect(lifecycleVersionActions('DRAFT')).toEqual({
      canEdit: true,
      canSubmitReview: true,
      canPublish: true,
      canFork: false,
      canRetire: false,
    });
    expect(lifecycleVersionActions('REVIEW')).toEqual({
      canEdit: false,
      canSubmitReview: false,
      canPublish: true,
      canFork: false,
      canRetire: false,
    });
    expect(lifecycleVersionActions('PUBLISHED')).toEqual({
      canEdit: false,
      canSubmitReview: false,
      canPublish: false,
      canFork: true,
      canRetire: true,
    });
  });

  it('allows a retired version to be forked without offering a second retirement', () => {
    expect(lifecycleVersionActions('RETIRED')).toEqual({
      canEdit: false,
      canSubmitReview: false,
      canPublish: false,
      canFork: true,
      canRetire: false,
    });
  });
});
