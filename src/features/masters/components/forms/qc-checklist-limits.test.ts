import { describe, expect, it } from 'vitest';
import { serializeQcChecklistLimits } from './qc-checklist-limits';

describe('serializeQcChecklistLimits', () => {
  it('preserves required measurement limits as decimal strings', () => {
    expect(serializeQcChecklistLimits({ required: true, min: '-0.05', max: '0.05' })).toBe(
      '{"required":true,"min":"-0.05","max":"0.05"}',
    );
  });

  it('rejects an inverted range and non-numeric bounds', () => {
    expect(() => serializeQcChecklistLimits({ required: true, min: '2', max: '1' })).toThrow(
      'Minimum must be less than or equal to maximum',
    );
    expect(() => serializeQcChecklistLimits({ required: true, min: 'wide', max: '' })).toThrow(
      'Measurement limits must be numeric',
    );
  });
});
