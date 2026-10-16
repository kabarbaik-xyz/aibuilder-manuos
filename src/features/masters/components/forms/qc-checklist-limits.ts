export interface QcChecklistLimitsDraft {
  required: boolean;
  min: string;
  max: string;
}

export function serializeQcChecklistLimits(draft: QcChecklistLimitsDraft): string {
  const min = draft.min.trim();
  const max = draft.max.trim();
  const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

  if ([min, max].some((bound) => bound !== '' && !decimal.test(bound))) {
    throw new Error('Measurement limits must be numeric');
  }
  if (min !== '' && max !== '' && Number(min) > Number(max)) {
    throw new Error('Minimum must be less than or equal to maximum');
  }

  return JSON.stringify({
    required: draft.required,
    ...(min === '' ? {} : { min }),
    ...(max === '' ? {} : { max }),
  });
}
