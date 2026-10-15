import { describe, it, expect } from 'vitest';
import { queryFactoryMemoryStats } from './similarity';
import { seedHistory } from '../data/seed';

describe('Factory Memory Similarity Engine', () => {
  it('computes mean overrun for rev 1 and recommends rev 2 with 15% buffer padding', () => {
    const stats = queryFactoryMemoryStats(
      {
        partFamily: 'bracket',
        operationType: 'Bending',
      },
      seedHistory
    );

    expect(stats.sampleCount).toBeGreaterThanOrEqual(1);
    expect(stats.bestRoutingVersion).toBe('rev 2');
    expect(stats.recommendedPaddingPct).toBe(15);
    expect(stats.meanOverrunPct).toBe(18.0);
    expect(stats.recommendationTitle).toContain('Use routing rev 2');
  });
});
