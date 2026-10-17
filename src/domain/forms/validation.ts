import { FormDefinition, Answers, FormValidation, FormIssue } from './types';
import { evaluateVisibility } from './conditions';

function compareDecimalStrings(left: string, right: string): number {
  const parse = (value: string) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new Error('Decimal comparison requires validated decimal strings.');
    const negative = match[1] === '-';
    const integer = match[2].replace(/^0+(?=\d)/, '');
    const fraction = (match[3] ?? '').replace(/0+$/, '');
    return { negative: negative && (integer !== '0' || fraction.length > 0), integer, fraction };
  };

  const a = parse(left);
  const b = parse(right);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;

  const integerCompare = a.integer.length === b.integer.length
    ? a.integer === b.integer ? 0 : a.integer < b.integer ? -1 : 1
    : Math.sign(a.integer.length - b.integer.length);
  const fractionLength = Math.max(a.fraction.length, b.fraction.length);
  const fractionA = a.fraction.padEnd(fractionLength, '0');
  const fractionB = b.fraction.padEnd(fractionLength, '0');
  const fractionCompare = fractionA === fractionB ? 0 : fractionA < fractionB ? -1 : 1;
  const magnitudeCompare = integerCompare || fractionCompare;
  return a.negative ? -magnitudeCompare : magnitudeCompare;
}

export function validateAnswers(
  definition: FormDefinition,
  rawAnswers: unknown,
  mode: 'DRAFT' | 'FINAL'
): FormValidation {
  const issues: FormIssue[] = [];
  const normalized: Answers = {};

  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return {
      valid: false,
      normalized: {},
      issues: [{ code: 'INVALID_PAYLOAD', message: 'Answers payload must be an object' }],
    };
  }

  const answers = rawAnswers as Record<string, unknown>;
  const knownFieldMap = new Map(definition.fields.map((f) => [f.key, f]));

  // 1. Unknown keys check
  for (const k of Object.keys(answers)) {
    if (!knownFieldMap.has(k)) {
      issues.push({
        fieldKey: k,
        code: 'UNKNOWN_FIELD',
        message: `Unknown field key '${k}' is not defined in the form schema`,
      });
    }
  }

  // 2. Determine visible fields with current answers
  // Cast answers to Answers for visibility evaluation
  const typedAnswers: Answers = {};
  for (const [k, v] of Object.entries(answers)) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || Array.isArray(v)) {
      typedAnswers[k] = v as any;
    }
  }

  const visibleFieldKeys = evaluateVisibility(definition, typedAnswers);

  // 3. Validate visible fields
  for (const field of definition.fields) {
    if (!visibleFieldKeys.has(field.key)) {
      // Hidden fields are excluded from normalized answers (stale values dropped)
      continue;
    }

    const val = answers[field.key];
    const isPresent = val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);

    if (!isPresent) {
      if (mode === 'FINAL' && field.required) {
        issues.push({
          fieldKey: field.key,
          code: 'REQUIRED',
          message: `${field.label} is required`,
        });
      }
      normalized[field.key] = null;
      continue;
    }

    // Validate type/value according to kind
    switch (field.kind) {
      case 'text':
      case 'textarea': {
        if (typeof val !== 'string') {
          issues.push({ fieldKey: field.key, code: 'INVALID_TYPE', message: `${field.label} must be a text string` });
        } else {
          const maxLen = field.maxLength ?? (field.kind === 'text' ? 4000 : 20000);
          if (val.length > maxLen) {
            issues.push({
              fieldKey: field.key,
              code: 'MAX_LENGTH_EXCEEDED',
              message: `${field.label} exceeds maximum allowed length of ${maxLen}`,
            });
          } else {
            normalized[field.key] = val;
          }
        }
        break;
      }

      case 'decimal': {
        const strVal = String(val);
        if (!/^-?\d+(\.\d+)?$/.test(strVal)) {
          issues.push({ fieldKey: field.key, code: 'INVALID_DECIMAL', message: `${field.label} must be a valid decimal number` });
        } else {
          const parts = strVal.split('.');
          if (field.precision !== undefined && parts[1] && parts[1].length > field.precision) {
            issues.push({
              fieldKey: field.key,
              code: 'EXCESS_PRECISION',
              message: `${field.label} precision exceeds allowed ${field.precision} decimals`,
            });
          }

          if (field.min !== undefined && compareDecimalStrings(strVal, field.min) < 0) {
            issues.push({ fieldKey: field.key, code: 'MIN_VALUE', message: `${field.label} must be at least ${field.min}` });
          }
          if (field.max !== undefined && compareDecimalStrings(strVal, field.max) > 0) {
            issues.push({ fieldKey: field.key, code: 'MAX_VALUE', message: `${field.label} cannot exceed ${field.max}` });
          }

          normalized[field.key] = strVal;
        }
        break;
      }

      case 'date': {
        if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val))) {
          issues.push({ fieldKey: field.key, code: 'INVALID_DATE', message: `${field.label} must be a valid date in YYYY-MM-DD format` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      case 'select': {
        const validOpts = new Set(field.options?.map((o) => o.value) || []);
        if (typeof val !== 'string' || !validOpts.has(val)) {
          issues.push({ fieldKey: field.key, code: 'INVALID_OPTION', message: `${field.label} must select a valid option` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      case 'multiselect': {
        const validOpts = new Set(field.options?.map((o) => o.value) || []);
        if (!Array.isArray(val) || !val.every((v) => typeof v === 'string' && validOpts.has(v))) {
          issues.push({ fieldKey: field.key, code: 'INVALID_OPTIONS', message: `${field.label} contains invalid selections` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      case 'boolean': {
        if (typeof val !== 'boolean') {
          issues.push({ fieldKey: field.key, code: 'INVALID_BOOLEAN', message: `${field.label} must be true or false` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      case 'attachment': {
        if (!Array.isArray(val) || !val.every((v) => typeof v === 'string')) {
          issues.push({ fieldKey: field.key, code: 'INVALID_ATTACHMENT', message: `${field.label} attachments must be an array of document IDs` });
        } else if (val.length > 5) {
          issues.push({ fieldKey: field.key, code: 'MAX_FILES_EXCEEDED', message: `${field.label} cannot exceed 5 files` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      case 'reference': {
        if (typeof val !== 'string' || val.trim().length === 0) {
          issues.push({ fieldKey: field.key, code: 'INVALID_REFERENCE', message: `${field.label} must reference a valid entity ID` });
        } else {
          normalized[field.key] = val;
        }
        break;
      }

      default:
        normalized[field.key] = val as any;
    }
  }

  return {
    valid: issues.length === 0,
    normalized,
    issues,
  };
}
