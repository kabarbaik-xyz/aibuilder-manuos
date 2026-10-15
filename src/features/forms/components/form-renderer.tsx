'use client';

import React from 'react';
import { FormDefinition, Answers, FormIssue } from '@/domain/forms/types';
import { evaluateVisibility } from '@/domain/forms/conditions';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface FormRendererProps {
  definition: FormDefinition;
  value: Answers;
  onChange?: (nextValue: Answers) => void;
  issues?: FormIssue[];
  readOnly?: boolean;
}

export function FormRenderer({
  definition,
  value,
  onChange,
  issues = [],
  readOnly = false,
}: FormRendererProps) {
  const visibleKeys = evaluateVisibility(definition, value);

  const getIssueForField = (fieldKey: string) => {
    return issues.find((i) => i.fieldKey === fieldKey);
  };

  const handleFieldChange = (key: string, nextFieldValue: any) => {
    if (readOnly || !onChange) return;
    const nextAnswers: Answers = {
      ...value,
      [key]: nextFieldValue,
    };
    onChange(nextAnswers);
  };

  if (!definition.fields || definition.fields.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        No fields defined for this form.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {definition.fields.map((field) => {
        if (!visibleKeys.has(field.key)) {
          return null;
        }

        const issue = getIssueForField(field.key);
        const val = value[field.key];
        const inputId = `form-field-${field.key}`;

        const renderControl = () => {
          switch (field.kind) {
            case 'text':
              return (
                <Input
                  id={inputId}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}…`}
                  maxLength={field.maxLength ?? 4000}
                  disabled={readOnly}
                />
              );
            case 'textarea':
              return (
                <Textarea
                  id={inputId}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}…`}
                  maxLength={field.maxLength ?? 20000}
                  disabled={readOnly}
                  rows={3}
                />
              );
            case 'decimal':
              return (
                <Input
                  id={inputId}
                  type="number"
                  step={field.precision ? Math.pow(10, -field.precision).toString() : 'any'}
                  value={val !== null && val !== undefined ? String(val) : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.precision !== undefined ? `0.${'0'.repeat(field.precision)}` : '0.00'}
                  min={field.min}
                  max={field.max}
                  disabled={readOnly}
                />
              );
            case 'date':
              return (
                <Input
                  id={inputId}
                  type="date"
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  disabled={readOnly}
                />
              );
            case 'select':
              return (
                <Select
                  id={inputId}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">Select an option…</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              );
            case 'boolean':
              return (
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                    disabled={readOnly}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-ink">{field.label}</span>
                </label>
              );
            case 'attachment':
              return (
                <div className="rounded-md border border-dashed border-line bg-surface p-3 text-sm">
                  {Array.isArray(val) && val.length > 0 ? (
                    <div className="space-y-1">
                      <span className="font-medium text-xs text-muted">Attached files ({val.length}):</span>
                      <ul className="list-inside list-disc text-xs text-ink">
                        {val.map((docId: string, idx: number) => (
                          <li key={idx}>Document ID: {docId}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">
                      {readOnly ? 'No documents attached' : 'Click or drop files (PDF/PNG/JPEG, max 5 files)'}
                    </span>
                  )}
                </div>
              );
            case 'reference':
            default:
              return (
                <Input
                  id={inputId}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={`Reference ID for ${field.referenceType || 'entity'}…`}
                  disabled={readOnly}
                />
              );
          }
        };

        return (
          <div key={field.key} className="space-y-1">
            <FormField
              id={inputId}
              label={field.label}
              required={field.required}
              help={field.helpText}
              error={issue?.message}
            >
              {renderControl()}
            </FormField>
          </div>
        );
      })}
    </div>
  );
}
