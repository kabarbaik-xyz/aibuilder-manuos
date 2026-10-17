import { describe, it, expect } from 'vitest';
import { validateDefinition } from './schema';
import { validateAnswers } from './validation';
import { FormDefinition } from './types';

describe('DF01: Form Definition and Answer Validation Engine', () => {
  it('rejects duplicate field keys in definition', () => {
    const invalidDef = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        { key: 'torque_nm', label: 'Torque (Nm)', kind: 'decimal' },
        { key: 'torque_nm', label: 'Duplicate Torque', kind: 'decimal' },
      ],
    };

    expect(() => validateDefinition(invalidDef)).toThrow(/Duplicate field key/);
  });

  it('rejects unknown field kind or invalid field configuration', () => {
    const invalidDef = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        { key: 'bad_field', label: 'Bad Field', kind: 'magic_ai_type' },
      ],
    };

    expect(() => validateDefinition(invalidDef)).toThrow(/Invalid form definition/);
  });

  it('rejects forward or cyclic condition references in definition', () => {
    const forwardDef = {
      schemaVersion: 1,
      purpose: 'QC_EVIDENCE',
      fields: [
        {
          key: 'coat_thickness',
          label: 'Thickness',
          kind: 'decimal',
          visibleWhen: { fieldKey: 'needs_coating', operator: 'equals', value: true },
        },
        { key: 'needs_coating', label: 'Needs Coating', kind: 'boolean' },
      ],
    };

    expect(() => validateDefinition(forwardDef)).toThrow(/unknown or forward field/);
  });

  it('rejects conditions referencing non-boolean/non-select fields or invalid options', () => {
    const badCondDef = {
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        {
          key: 'notes',
          label: 'Notes',
          kind: 'text',
        },
        {
          key: 'sub_note',
          label: 'Sub Note',
          kind: 'text',
          visibleWhen: { fieldKey: 'notes', operator: 'equals', value: 'hello' },
        },
      ],
    };

    expect(() => validateDefinition(badCondDef)).toThrow(/can only reference a 'boolean' or 'select' field/);
  });

  it('rejects unknown answer keys not present in the definition', () => {
    const def: FormDefinition = validateDefinition({
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        { key: 'temperature', label: 'Temperature (C)', kind: 'decimal' },
      ],
    });

    const res = validateAnswers(def, { temperature: '24.5', hacker_injected_key: 'malicious' }, 'DRAFT');
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'UNKNOWN_FIELD')).toBe(true);
  });

  it('validates types, decimal precision, bounds, and date format', () => {
    const def: FormDefinition = validateDefinition({
      schemaVersion: 1,
      purpose: 'QC_EVIDENCE',
      fields: [
        { key: 'reading', label: 'Reading', kind: 'decimal', precision: 2, min: '10.0', max: '50.0' },
        { key: 'check_date', label: 'Check Date', kind: 'date' },
      ],
    });

    // Precision violation
    const excessPrecision = validateAnswers(def, { reading: '25.123', check_date: '2026-11-24' }, 'DRAFT');
    expect(excessPrecision.valid).toBe(false);
    expect(excessPrecision.issues.some((i) => i.code === 'EXCESS_PRECISION')).toBe(true);

    // Min violation
    const belowMin = validateAnswers(def, { reading: '5.0', check_date: '2026-11-24' }, 'DRAFT');
    expect(belowMin.valid).toBe(false);
    expect(belowMin.issues.some((i) => i.code === 'MIN_VALUE')).toBe(true);

    // Invalid date
    const badDate = validateAnswers(def, { reading: '20.0', check_date: 'not-a-date' }, 'DRAFT');
    expect(badDate.valid).toBe(false);
    expect(badDate.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true);
  });

  it('compares decimal bounds exactly without floating-point rounding', () => {
    const def: FormDefinition = validateDefinition({
      schemaVersion: 1,
      purpose: 'TASK_EVIDENCE',
      fields: [
        { key: 'reading', label: 'Reading', kind: 'decimal', max: '9007199254740992.0000000000000001' },
      ],
    });

    const aboveMax = validateAnswers(def, { reading: '9007199254740992.0000000000000002' }, 'FINAL');
    expect(aboveMax.valid).toBe(false);
    expect(aboveMax.issues.some((issue) => issue.code === 'MAX_VALUE')).toBe(true);
  });

  it('executes exact fixture: finish select with painted/raw and conditional paint_code', () => {
    // Exact specification fixture:
    // finish select with painted/raw; required paint_code text visible only when finish equals painted.
    // FINAL {finish:'painted'} fails at paint_code;
    // {finish:'raw', paint_code:'OLD'} succeeds normalized to {finish:'raw'}.
    const fixtureDef: FormDefinition = validateDefinition({
      schemaVersion: 1,
      purpose: 'ORDER_SPEC',
      fields: [
        {
          key: 'finish',
          label: 'Surface Finish',
          kind: 'select',
          required: true,
          options: [
            { value: 'painted', label: 'Painted' },
            { value: 'raw', label: 'Raw' },
          ],
        },
        {
          key: 'paint_code',
          label: 'Paint Code',
          kind: 'text',
          required: true,
          visibleWhen: { fieldKey: 'finish', operator: 'equals', value: 'painted' },
        },
      ],
    });

    // 1. FINAL with finish: 'painted' and missing paint_code must fail on paint_code
    const finalMissing = validateAnswers(fixtureDef, { finish: 'painted' }, 'FINAL');
    expect(finalMissing.valid).toBe(false);
    expect(finalMissing.issues.some((i) => i.fieldKey === 'paint_code' && i.code === 'REQUIRED')).toBe(true);

    // 2. FINAL with finish: 'painted' and valid paint_code succeeds
    const finalPainted = validateAnswers(
      fixtureDef,
      { finish: 'painted', paint_code: 'RAL-9005' },
      'FINAL'
    );
    expect(finalPainted.valid).toBe(true);
    expect(finalPainted.normalized).toEqual({
      finish: 'painted',
      paint_code: 'RAL-9005',
    });

    // 3. Stale value removal: { finish: 'raw', paint_code: 'OLD' } succeeds normalized to { finish: 'raw' }
    const rawStale = validateAnswers(
      fixtureDef,
      { finish: 'raw', paint_code: 'OLD' },
      'FINAL'
    );
    expect(rawStale.valid).toBe(true);
    expect(rawStale.normalized).toEqual({
      finish: 'raw',
    });
    // paint_code must be completely removed from normalized output
    expect(rawStale.normalized.paint_code).toBeUndefined();
  });
});
