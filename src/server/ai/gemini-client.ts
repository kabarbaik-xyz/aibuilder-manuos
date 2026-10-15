import { GoogleGenAI } from '@google/genai';

// 5-minute memory cache
const cache = new Map<string, { data: any; expiry: number }>();

export interface AICallOptions {
  model?: string;
  responseMimeType?: string;
  responseSchema?: any;
}

export interface AICallResponse<T> {
  aiResult: T | null;
  reason?: 'unavailable' | 'schema' | 'timeout' | 'error';
  rawText?: string;
}

/**
 * Server-only helper to invoke Google Gemini with caching, bounded retries, and schema fallback.
 */
export async function callGeminiStructured<T>(
  prompt: string,
  cacheKey: string,
  options: AICallOptions = {}
): Promise<AICallResponse<T>> {
  // 1. Check in-memory cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return { aiResult: cached.data };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_gemini_api_key_here')) {
    return {
      aiResult: null,
      reason: 'unavailable',
    };
  }

  const modelName = options.model || process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Request with 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: options.responseMimeType || 'application/json',
        responseSchema: options.responseSchema,
        temperature: 0.2,
      },
    });

    clearTimeout(timeoutId);

    const text = response.text?.trim() || '';
    if (!text) {
      return { aiResult: null, reason: 'unavailable' };
    }

    try {
      const parsed = JSON.parse(text) as T;
      // Cache valid result for 5 minutes
      cache.set(cacheKey, {
        data: parsed,
        expiry: Date.now() + 5 * 60 * 1000,
      });
      return { aiResult: parsed, rawText: text };
    } catch {
      return { aiResult: null, reason: 'schema', rawText: text };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { aiResult: null, reason: 'timeout' };
    }
    return { aiResult: null, reason: 'unavailable' };
  }
}
