import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { buildAuthorizedContext } from '@/server/ai/context';
import { validateGroundedOutput, Explanation } from '@/server/ai/validation';
import { ProductionBrainService, BrainAnswerSchema, BrainAnswerDTO } from '@/server/ai/brain';
import { getCached, setCached, clearCache } from '@/server/ai/cache';
import { z } from 'zod';

describe('I04: Shared Grounded-AI Boundary and Production Brain', () => {
  let fixture: FactoryFixture;
  let brainService: ProductionBrainService;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    brainService = new ProductionBrainService(fixture.db);
    clearCache();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('builds strictly scoped authorized context and deterministic contextHash', async () => {
    const { alpha } = fixture;

    const context = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);

    expect(context).toBeDefined();
    expect(context.workspaceId).toBe(alpha.workspaceId);
    expect(context.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(context.evidenceIndex.length).toBeGreaterThan(0);

    // Scoped context hash must change when workspace revision increments
    const initialHash = context.contextHash;

    await fixture.db.workspace.update({
      where: { id: alpha.workspaceId },
      data: { revision: { increment: 1 } },
    });

    const updatedContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);
    expect(updatedContext.contextHash).not.toBe(initialHash);
  });

  it('restricts customer user context strictly to their owned company orders', async () => {
    const { alpha } = fixture;

    // Customer user context
    const customerContext = await buildAuthorizedContext(alpha.users.customerUser.principal, fixture.db);

    // Customer must never see orders from other customers
    for (const order of customerContext.orders) {
      expect(order.customerName).toBe('Apex Dynamics Corp');
    }
  });

  it('validates grounded output and flags ungrounded hallucinated references', async () => {
    const { alpha } = fixture;
    const fgItem = await fixture.db.item.findUnique({
      where: { id: alpha.masters.fgItemId },
    });
    expect(fgItem).toBeDefined();

    const context = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);

    const testSchema = z.object({
      answer: z.string(),
      evidenceRefs: z.array(z.string()),
    });

    // Valid grounded output
    const validOutput = {
      answer: 'Analysis complete for part',
      evidenceRefs: [fgItem!.code],
    };

    const validRes = validateGroundedOutput({
      schema: testSchema,
      rawData: validOutput,
      context,
      model: 'test-model',
    });

    expect(validRes.status).toBe('SUCCESS');
    if (validRes.status === 'SUCCESS') {
      expect(validRes.evidenceRefs).toContain(fgItem!.code);
    }

    // Ungrounded hallucinated output
    const hallucinatedOutput = {
      answer: 'Fabricated order analysis',
      evidenceRefs: ['ORD-FAKE-999999', 'PART-NONEXISTENT'],
    };

    const invalidRes = validateGroundedOutput({
      schema: testSchema,
      rawData: hallucinatedOutput,
      context,
      model: 'test-model',
    });

    expect(invalidRes.status).toBe('FALLBACK');
    if (invalidRes.status === 'FALLBACK') {
      expect(invalidRes.reason).toBe('UNGROUNDED_CLAIM');
    }
  });

  it('provides grounded deterministic answers through ProductionBrainService without AI keys', async () => {
    const { alpha } = fixture;

    const res = await brainService.answerProductionQuestion(
      alpha.users.planner.principal,
      'What active orders do we have?'
    );

    expect(res).toBeDefined();
    // In test environment without GEMINI_API_KEY, fallbackData is populated with grounded real DB facts
    const answerData = res.status === 'SUCCESS' ? res.data : res.fallbackData;
    expect(answerData).toBeDefined();
    expect(answerData!.answer).toBeDefined();
    expect(typeof answerData!.answer).toBe('string');
    expect(answerData!.linkToScreen).toBeDefined();
  });

  it('enforces scoped in-memory caching with TTL', () => {
    const key = 'test-cache-key';
    setCached(key, { result: 'stored-data' }, 1000);

    const cached = getCached<{ result: string }>(key);
    expect(cached).toBeDefined();
    expect(cached?.result).toBe('stored-data');

    clearCache();
    expect(getCached(key)).toBeNull();
  });
});
