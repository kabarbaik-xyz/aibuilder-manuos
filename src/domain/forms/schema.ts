import { z } from 'zod';
import { ValidationError } from '@/domain/errors';
import { FormDefinition, FormField, Condition } from './types';

const fieldKeyRegex = /^[a-z][a-z0-9_]{0,63}$/;

export const conditionSchema = z.object({
  fieldKey: z.string().regex(fieldKeyRegex, 'Invalid condition field key'),
  operator: z.enum(['equals', 'notEquals', 'in']),
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
});

export const formFieldSchema = z.object({
  key: z.string().regex(fieldKeyRegex, 'Field key must match ^[a-z][a-z0-9_]{0,63}$'),
  label: z.string().min(1, 'Label is required').max(120, 'Label cannot exceed 120 characters'),
  kind: z.enum([
    'text',
    'textarea',
    'decimal',
    'date',
    'select',
    'multiselect',
    'boolean',
    'attachment',
    'reference',
  ]),
  required: z.boolean().default(false),
  helpText: z.string().max(1000, 'Help text cannot exceed 1,000 characters').optional(),
  visibleWhen: conditionSchema.optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1),
      })
    )
    .max(100)
    .optional(),
  referenceType: z.enum(['customer', 'item', 'machine']).optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  precision: z.number().int().min(0).max(6).optional(),
});

export const formDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  purpose: z.enum(['ORDER_SPEC', 'TASK_EVIDENCE', 'QC_EVIDENCE']),
  fields: z.array(formFieldSchema).min(1, 'At least 1 field is required').max(100, 'Maximum 100 fields allowed'),
});

export function validateDefinition(rawDefinition: unknown): FormDefinition {
  const parseRes = formDefinitionSchema.safeParse(rawDefinition);
  if (!parseRes.success) {
    throw new ValidationError(
      `Invalid form definition: ${parseRes.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }

  const def = parseRes.data as FormDefinition;
  const seenKeys = new Map<string, FormField>();

  for (let i = 0; i < def.fields.length; i++) {
    const field = def.fields[i];

    // 1. Check unique keys
    if (seenKeys.has(field.key)) {
      throw new ValidationError(`Duplicate field key detected: '${field.key}'`);
    }

    // 2. Kind-specific bounds
    if (field.kind === 'text') {
      const maxL = field.maxLength ?? 4000;
      if (maxL > 4000) {
        throw new ValidationError(`Field '${field.key}' maxLength cannot exceed 4,000 for text`);
      }
    } else if (field.kind === 'textarea') {
      const maxL = field.maxLength ?? 20000;
      if (maxL > 20000) {
        throw new ValidationError(`Field '${field.key}' maxLength cannot exceed 20,000 for textarea`);
      }
    } else if (field.kind === 'decimal') {
      if (field.precision !== undefined && (field.precision < 0 || field.precision > 6)) {
        throw new ValidationError(`Field '${field.key}' precision must be between 0 and 6`);
      }
    } else if (field.kind === 'select' || field.kind === 'multiselect') {
      if (!field.options || field.options.length === 0) {
        throw new ValidationError(`Field '${field.key}' requires at least 1 option`);
      }
      if (field.options.length > 100) {
        throw new ValidationError(`Field '${field.key}' cannot exceed 100 options`);
      }
      const optionValues = new Set<string>();
      for (const opt of field.options) {
        if (optionValues.has(opt.value)) {
          throw new ValidationError(`Field '${field.key}' has duplicate option value '${opt.value}'`);
        }
        optionValues.add(opt.value);
      }
    } else if (field.kind === 'reference') {
      if (!field.referenceType || !['customer', 'item', 'machine'].includes(field.referenceType)) {
        throw new ValidationError(`Field '${field.key}' of kind reference requires a valid referenceType`);
      }
    }

    // 3. Condition validation (references earlier fields only, no forward or cyclic references)
    if (field.visibleWhen) {
      const cond = field.visibleWhen;
      if (!seenKeys.has(cond.fieldKey)) {
        throw new ValidationError(
          `Field '${field.key}' condition references unknown or forward field '${cond.fieldKey}'`
        );
      }

      const parentField = seenKeys.get(cond.fieldKey)!;
      if (parentField.kind === 'boolean') {
        if (cond.operator !== 'equals' && cond.operator !== 'notEquals') {
          throw new ValidationError(
            `Field '${field.key}' condition on boolean field '${cond.fieldKey}' must use 'equals' or 'notEquals'`
          );
        }
        if (typeof cond.value !== 'boolean') {
          throw new ValidationError(
            `Field '${field.key}' condition on boolean field '${cond.fieldKey}' requires a boolean value`
          );
        }
      } else if (parentField.kind === 'select') {
        const validValues = new Set(parentField.options?.map((o) => o.value) || []);
        if (cond.operator === 'equals' || cond.operator === 'notEquals') {
          if (typeof cond.value !== 'string' || !validValues.has(cond.value)) {
            throw new ValidationError(
              `Field '${field.key}' condition value '${cond.value}' is not a valid option of '${cond.fieldKey}'`
            );
          }
        } else if (cond.operator === 'in') {
          if (!Array.isArray(cond.value) || !cond.value.every((v) => validValues.has(v))) {
            throw new ValidationError(
              `Field '${field.key}' condition 'in' values contain invalid options of '${cond.fieldKey}'`
            );
          }
        }
      } else {
        throw new ValidationError(
          `Field '${field.key}' condition can only reference a 'boolean' or 'select' field, found '${parentField.kind}'`
        );
      }
    }

    seenKeys.set(field.key, field);
  }

  return def;
}
