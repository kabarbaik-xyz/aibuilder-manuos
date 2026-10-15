import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiStructured } from './gemini-client';

describe('Gemini Server AI Client & Graceful Fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GEMINI_API_KEY;
  });

  it('gracefully returns reason unavailable when GEMINI_API_KEY is not set', async () => {
    const res = await callGeminiStructured<any>('test prompt', 'test-key-1');
    expect(res.aiResult).toBeNull();
    expect(res.reason).toBe('unavailable');
  });

  it('handles empty or placeholder API key gracefully', async () => {
    process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';
    const res = await callGeminiStructured<any>('test prompt', 'test-key-2');
    expect(res.aiResult).toBeNull();
    expect(res.reason).toBe('unavailable');
  });
});
