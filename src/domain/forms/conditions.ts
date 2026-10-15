import { FormDefinition, Answers, Condition } from './types';

export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  const targetVal = answers[condition.fieldKey];

  switch (condition.operator) {
    case 'equals':
      return targetVal === condition.value;
    case 'notEquals':
      return targetVal !== condition.value;
    case 'in':
      if (Array.isArray(condition.value)) {
        if (typeof targetVal === 'string') {
          return condition.value.includes(targetVal);
        }
        if (Array.isArray(targetVal)) {
          return targetVal.some((v) => (condition.value as string[]).includes(v));
        }
      }
      return false;
    default:
      return false;
  }
}

export function evaluateVisibility(definition: FormDefinition, answers: Answers): Set<string> {
  const visible = new Set<string>();

  for (const field of definition.fields) {
    if (!field.visibleWhen) {
      visible.add(field.key);
      continue;
    }

    // Condition can only reference an earlier field
    const refKey = field.visibleWhen.fieldKey;
    if (!visible.has(refKey)) {
      // If the parent condition field is not visible, dependent is also not visible
      continue;
    }

    if (evaluateCondition(field.visibleWhen, answers)) {
      visible.add(field.key);
    }
  }

  return visible;
}
