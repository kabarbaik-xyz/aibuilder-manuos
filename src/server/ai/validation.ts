import { z } from 'zod';
import { AuthorizedContext } from './context';

export type Explanation<T> =
  | {
      status: 'SUCCESS';
      data: T;
      evidenceRefs: string[];
      contextHash: string;
      model?: string;
    }
  | {
      status: 'FALLBACK';
      reason: 'UNAVAILABLE' | 'SCHEMA_ERROR' | 'UNGROUNDED_CLAIM' | 'TIMEOUT';
      message: string;
      fallbackData?: T;
      contextHash: string;
    };

export interface ValidateGroundedOptions<T> {
  schema: z.ZodType<T, any, any>;
  rawData: unknown;
  context: AuthorizedContext;
  model?: string;
  fallbackData?: T;
}

/**
 * Validates raw AI output against a strict Zod schema and confirms references against hydrated context.
 */
export function validateGroundedOutput<T>(options: ValidateGroundedOptions<T>): Explanation<T> {
  const { schema, rawData, context, model, fallbackData } = options;

  if (!rawData) {
    return {
      status: 'FALLBACK',
      reason: 'UNAVAILABLE',
      message: 'Provider did not return a response',
      fallbackData,
      contextHash: context.contextHash,
    };
  }

  const parseResult = schema.safeParse(rawData);
  if (!parseResult.success) {
    return {
      status: 'FALLBACK',
      reason: 'SCHEMA_ERROR',
      message: `Output failed validation: ${parseResult.error.message}`,
      fallbackData,
      contextHash: context.contextHash,
    };
  }

  const data = parseResult.data as any;
  const rawEvidence = Array.isArray(data?.evidenceRefs) ? (data.evidenceRefs as string[]) : [];

  // Grounding check: ensure evidence refs are grounded in context
  const validIndex = new Set(context.evidenceIndex.map((e) => e.toLowerCase()));
  const verifiedRefs: string[] = [];
  const ungroundedRefs: string[] = [];

  for (const ref of rawEvidence) {
    const cleanRef = String(ref).trim().replace(/^#/, '');
    if (validIndex.has(cleanRef.toLowerCase()) || validIndex.has(String(ref).toLowerCase())) {
      verifiedRefs.push(ref);
    } else {
      ungroundedRefs.push(ref);
    }
  }

  // If the model claimed evidence refs but none exist in our context, flag as ungrounded claim
  if (rawEvidence.length > 0 && verifiedRefs.length === 0) {
    return {
      status: 'FALLBACK',
      reason: 'UNGROUNDED_CLAIM',
      message: `AI generated ungrounded references: ${ungroundedRefs.join(', ')}`,
      fallbackData,
      contextHash: context.contextHash,
    };
  }

  return {
    status: 'SUCCESS',
    data: parseResult.data,
    evidenceRefs: verifiedRefs,
    contextHash: context.contextHash,
    model,
  };
}
