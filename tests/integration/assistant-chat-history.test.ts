import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { readChatHistory, saveChatMessage, type SavedChatMessage } from '@/server/ai/chat-history';

describe('Personal assistant history', () => {
 let fixture: FactoryFixture;
 beforeAll(async () => { fixture = await createFactoryFixture(); });
 afterAll(async () => { await fixture.close(); });
 const message = (question: string): SavedChatMessage => ({ question, answer: { answer: 'Recorded answer', evidenceRefs: [] }, status: 'SUCCESS' });
 it('persists replay-safe answers and isolates membership, workspace and changed access', async () => {
  const principal = { ...fixture.alpha.users.admin.principal, permissions: new Set(['planning.read', 'inventory.read']) };
  const key = randomUUID();
  await saveChatMessage(fixture.db, principal, message('first'), key);
  expect((await saveChatMessage(fixture.db, principal, message('first'), key)).meta.replayed).toBe(true);
  expect((await readChatHistory(fixture.db, principal)).map(m => m.question)).toEqual(['first']);
  expect(await readChatHistory(fixture.db, { ...fixture.beta.users.owner.principal, permissions: new Set(['planning.read']) })).toEqual([]);
  expect(await readChatHistory(fixture.db, { ...principal, membershipId: fixture.alpha.users.planner.principal.membershipId })).toEqual([]);
  expect(await readChatHistory(fixture.db, { ...principal, permissions: new Set(['planning.read']) })).toEqual([]);
  await expect(readChatHistory(fixture.db, { ...principal, permissions: new Set() })).rejects.toThrow();
 });
 it('keeps only20 latest entries and restores chronological order', async () => {
  const principal = { ...fixture.alpha.users.admin.principal, permissions: new Set(['planning.read', 'inventory.read']) };
  for (let i = 0; i < 22; i++) await saveChatMessage(fixture.db, principal, message(`question${i}`), randomUUID());
  const rows = await readChatHistory(fixture.db, principal);
  expect(rows).toHaveLength(20);
  expect(rows[0].question).toBe('question2'); expect(rows.at(-1)?.question).toBe('question21');
  expect(await fixture.db.assistantChatEntry.count({ where: { membershipId: principal.membershipId } })).toBe(20);
 });
});
