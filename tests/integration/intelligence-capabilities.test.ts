import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { CapabilityRegistryService } from '@/server/modules/intelligence/capabilities';

describe('CoreAI capability readiness', () => {
  let fixture: FactoryFixture;
  let service: CapabilityRegistryService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    service = new CapabilityRegistryService();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('surfaces finite-capacity schedule dry-run from CoreAI with its conservative limits', () => {
    const result = service.getCapabilities(fixture.alpha.users.planner.principal);
    const schedule = result.capabilities.find((capability) => capability.id === 'SCH-08');

    expect(schedule).toMatchObject({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      href: '/planning',
      statusLabel: 'Dry-run proposal available in Planning',
    });
    expect(schedule?.unavailableReason).toContain('work is not split across shifts');
  });

  it('surfaces Promise date comparison only for released jobs with complete schedule evidence', () => {
    const result = service.getCapabilities(fixture.alpha.users.planner.principal);
    const promise = result.capabilities.find((capability) => capability.id === 'AII-04');

    expect(promise).toMatchObject({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      href: '/planning',
      statusLabel: 'Existing-job date evaluation available',
    });
    expect(promise?.prerequisite).toContain('does not commit a customer promise');
  });

  it('labels recovery schedule snapshots as review-only while Apply is gated', () => {
    const result = service.getCapabilities(fixture.alpha.users.planner.principal);
    const recovery = result.capabilities.find((capability) => capability.id === 'AII-06');

    expect(recovery).toMatchObject({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      href: '/ai/recovery',
      statusLabel: 'Schedule review available; recovery alternatives and Apply disabled',
    });
    expect(recovery?.prerequisite).toContain('Revalidate current bookings and versions');
  });
});
