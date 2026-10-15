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

  it('returns insufficient historical evidence when query matches zero records', () => {
    const stats = queryFactoryMemoryStats(
      {
        partFamily: 'nonexistent-family',
        operationType: 'Laser Sintering',
      },
      seedHistory
    );

    expect(stats.sampleCount).toBe(0);
    expect(stats.meanOverrunPct).toBe(0);
    expect(stats.runs.length).toBe(0);
    expect(stats.recommendationTitle).toBe('Insufficient historical evidence');
  });
});
