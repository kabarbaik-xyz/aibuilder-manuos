import { describe, it, expect } from 'vitest';
import { matchNetworkCapacity, matchNetworkSupply } from './network';
import { seedFactories } from '../data/seed';

describe('Factory Network Matching Engine', () => {
  it('strictly respects data sharing consent gates', () => {
    const matches = matchNetworkCapacity(seedFactories, 'Machining', 50);

    for (const match of matches) {
      expect(match.factory.consentShareCapacity).toBe(true);
      expect(match.factory.id).not.toBe('factory-precision'); // Host factory excluded
    }
  });

  it('matches network supply for missing components with verified inventory', () => {
    const matches = matchNetworkSupply(seedFactories, 'TB-24', 40);

    expect(matches.length).toBeGreaterThan(0);
    const top = matches[0];
    expect(top.factory.consentShareSupply).toBe(true);
    expect(top.availableQty).toBeGreaterThanOrEqual(40);
    expect(top.daysSavedVsDelayed).toBeGreaterThan(0);
  });
});
