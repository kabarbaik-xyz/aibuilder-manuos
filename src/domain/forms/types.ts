export type FormPurpose = 'ORDER_SPEC' | 'TASK_EVIDENCE' | 'QC_EVIDENCE';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'decimal'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'attachment'
  | 'reference';

export interface Condition {
  fieldKey: string;
  operator: 'equals' | 'notEquals' | 'in';
  value: string | boolean | string[];
}

export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  helpText?: string;
  visibleWhen?: Condition;
  options?: { value: string; label: string }[];
  referenceType?: 'customer' | 'item' | 'machine';
  min?: string;
  max?: string;
  maxLength?: number;
  precision?: number;
}

export interface FormDefinition {
  schemaVersion: 1;
  purpose: FormPurpose;
  fields: FormField[];
}

export type Answers = Record<string, string | string[] | boolean | null>;

export interface FormIssue {
  fieldKey?: string;
  code: string;
  message: string;
}

export interface FormValidation {
  valid: boolean;
  normalized: Answers;
  issues: FormIssue[];
}
