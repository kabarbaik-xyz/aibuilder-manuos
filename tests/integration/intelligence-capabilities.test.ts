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
      href: '/ai/schedule',
      statusLabel: 'Schedule proposal available for review',
    });
    expect(schedule?.unavailableReason).toContain('work is not split across shifts');
  });

  it('surfaces Promise date comparison only for released jobs with complete schedule evidence', () => {
    const result = service.getCapabilities(fixture.alpha.users.planner.principal);
    const promise = result.capabilities.find((capability) => capability.id === 'AII-04');

    expect(promise).toMatchObject({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      href: '/ai/promise',
      statusLabel: 'Delivery-date review available',
    });
    expect(promise?.prerequisite).toContain('does not commit a customer promise');
  });

  it('describes the connected Recovery Apply behavior without saying it is still gated', () => {
    const result = service.getCapabilities(fixture.alpha.users.planner.principal);
    const recovery = result.capabilities.find((capability) => capability.id === 'AII-06');

    expect(recovery).toMatchObject({
      state: 'DETERMINISTIC_READY',
      availablePage: true,
      href: '/ai/recovery',
      statusLabel: 'Schedule review, alternate machines, overtime proposals, and subcontract tracking available',
    });
    expect(recovery?.prerequisite).toContain('revalidate saved order/task evidence');
    expect(recovery?.prerequisite).toContain('supervisor-gated');
    expect(recovery?.unavailableReason).toContain('split-shipment allocation');
    expect(recovery?.prerequisite).toContain('affected technician direct supervisor');
  });

  it('describes supported RFQ file types and remaining citation limits', () => {
    const result = service.getCapabilities(fixture.alpha.users.owner.principal);
    const intake = result.capabilities.find((capability) => capability.id === 'AII-03');
    expect(intake?.summary).toContain('TXT/CSV');
    expect(intake?.prerequisite).toContain('PDF/image OCR');
    expect(intake?.prerequisite).toContain('line-span citations');
  });
});
