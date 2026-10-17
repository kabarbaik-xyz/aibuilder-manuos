import { describe, expect, it } from 'vitest';
import {
  formCorrectionRequestSchema,
  formDraftVersionRequestSchema,
  formDraftRequestSchema,
  formFinalizationRequestSchema,
  formVersionActionRequestSchema,
} from '@/server/modules/forms/contracts-schema';

describe('form submission request contracts', () => {
  it('requires a positive expected version and answer object for a draft', () => {
    expect(formDraftRequestSchema.safeParse({ expectedVersion: 1, answers: { notes: 'ok' } }).success).toBe(true);
    expect(formDraftRequestSchema.safeParse({ expectedVersion: 0, answers: {} }).success).toBe(false);
  });

  it('rejects caller-supplied actor or subject fields for every submission action', () => {
    expect(formDraftRequestSchema.safeParse({ expectedVersion: 1, answers: {}, actorId: 'forged' }).success).toBe(false);
    expect(formFinalizationRequestSchema.safeParse({ expectedVersion: 1, answers: {}, subjectId: 'forged' }).success).toBe(false);
    expect(formCorrectionRequestSchema.safeParse({ expectedVersion: 2, answers: {}, reason: 'fix', actorId: 'forged' }).success).toBe(false);
  });

  it('requires a non-empty correction reason', () => {
    expect(formCorrectionRequestSchema.safeParse({ expectedVersion: 2, answers: {}, reason: '  ' }).success).toBe(false);
  });

  it('accepts only known form lifecycle actions with a positive expected version', () => {
    expect(formVersionActionRequestSchema.safeParse({ action: 'publish', expectedVersion: 2 }).success).toBe(true);
    expect(formVersionActionRequestSchema.safeParse({ action: 'delete', expectedVersion: 2 }).success).toBe(false);
    expect(formVersionActionRequestSchema.safeParse({ action: 'publish', expectedVersion: 2, actorId: 'forged' }).success).toBe(false);
  });

  it('rejects actor fields when editing a draft form version', () => {
    expect(formDraftVersionRequestSchema.safeParse({
      expectedVersion: 1,
      definition: { schemaVersion: 1, purpose: 'ORDER_SPEC', fields: [{ key: 'spec', label: 'Spec', kind: 'text' }] },
    }).success).toBe(true);
    expect(formDraftVersionRequestSchema.safeParse({
      expectedVersion: 1,
      definition: { schemaVersion: 1, purpose: 'ORDER_SPEC', fields: [{ key: 'spec', label: 'Spec', kind: 'text' }] },
      actorId: 'forged',
    }).success).toBe(false);
  });
});
