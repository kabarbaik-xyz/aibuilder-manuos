import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { POST as postBrainQa } from '@/app/api/ai/brain-qa/route';
import { clearCache } from '@/server/ai/cache';

/**
 * Regression guard for the assistant's request contract.
 *
 * The workspace assistant clears its selected record by sending `context: null`.
 * The route schema originally used `.optional()`, which accepts `undefined` but
 * NOT `null`, so every question with no selection failed with
 * "Validation failed for request payload: context: Expected object, received null".
 */
describe('AI assistant request contract (brain-qa)', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    clearCache();
  });

  afterAll(async () => {
    await fixture.close();
  });

  function ask(body: unknown) {
    const headers = new Headers(fixture.alpha.users.planner.headers);
    headers.set('Content-Type', 'application/json');
    return postBrainQa(
      new NextRequest('http://localhost:3000/api/ai/brain-qa', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  it('accepts an explicit null context (how the client clears its selection)', async () => {
    const res = await ask({ question: 'Summarize inventory balances', context: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(typeof json.data.answer).toBe('string');
  });

  it('accepts an omitted context', async () => {
    const res = await ask({ question: 'Summarize inventory balances' });
    expect(res.status).toBe(200);
  });

  it('treats a syntactically valid context as a request, not a payload error', async () => {
    const res = await ask({ question: 'What is the status of this order?', context: { type: 'ORDER', id: 'missing-order' } });
    // Out-of-scope context is a domain concern (not found / forbidden), never a 400.
    expect(res.status).not.toBe(400);
  });

  it('still rejects unknown extra fields', async () => {
    const res = await ask({ question: 'Summarize inventory balances', unexpected: true });
    expect(res.status).toBe(400);
  });
});
