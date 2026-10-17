import { describe, expect, it } from 'vitest';
import { getPromiseDateDeltaLabel } from './promise-presentation';

describe('getPromiseDateDeltaLabel', () => {
  it('shows the completion date relative to the requested date', () => {
    expect(getPromiseDateDeltaLabel(-2)).toBe('Completes 2 days before the requested date');
    expect(getPromiseDateDeltaLabel(0)).toBe('Completes on the requested date');
    expect(getPromiseDateDeltaLabel(3)).toBe('Completes 3 days after the requested date');
  });

  it('does not claim a date comparison without a complete schedule', () => {
    expect(getPromiseDateDeltaLabel(null)).toBe('Date comparison unavailable');
  });
});
