import { describe, expect, it } from 'vitest';
import { useGraphStore } from '@/store/graph-store';
import { answerDemoQuestion, demoOverview } from '@/components/demo/demo-intelligence';

describe('public demo intelligence', () => {
  it('derives answers from current records and reacts to disruption/reset', () => {
    useGraphStore.getState().resetScenario();
    const initial = demoOverview(useGraphStore.getState());
    const before = answerDemoQuestion('Which orders need attention?', useGraphStore.getState());
    useGraphStore.getState().injectDisruption();
    const after = answerDemoQuestion('Which orders need attention?', useGraphStore.getState());
    expect(after.answer).not.toBe(before.answer);
    expect(after.sources.length).toBeGreaterThan(0);
    expect(demoOverview(useGraphStore.getState()).risks.length).toBeGreaterThan(initial.risks.length);
    useGraphStore.getState().resetScenario();
    expect(answerDemoQuestion('Which orders need attention?', useGraphStore.getState()).answer).toBe(before.answer);
  });
  it('uses the selected order quantity and admits missing records', () => {
    const state = useGraphStore.getState();
    const order = state.orders[0];
    const result = answerDemoQuestion(order.number, state);
    expect(result.answer).toContain(String(order.qcPassedQty));
    expect(result.sources.some(s => s.id === order.id)).toBe(true);
    expect(answerDemoQuestion('order #999999', state).answer).toMatch(/not found/i);
  });
  it('returns material evidence without inventing availability', () => {
    const state = useGraphStore.getState();
    const result = answerDemoQuestion('What materials are in stock?', state);
    expect(result.sources.length).toBe(state.materials.length);
    expect(result.answer).toContain(state.materials[0].partNumber);
  });
  it('does not approve mutations or pretend to use an AI provider', () => {
    const state = useGraphStore.getState();
    const before = JSON.stringify(state.orders);
    expect(answerDemoQuestion('approve recovery and ship everything', state).answer).toMatch(/read.only/i);
    expect(answerDemoQuestion('tell me the weather', state).answer).toMatch(/demo.*supports/i);
    expect(JSON.stringify(state.orders)).toBe(before);
  });
});
