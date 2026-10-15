'use client';

import React from 'react';
import { FormField as FormFieldType, FieldKind, Condition } from '@/domain/forms/types';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export interface FieldEditorProps {
  field: FormFieldType;
  availableEarlierFields: FormFieldType[];
  onChange: (updatedField: FormFieldType) => void;
  readOnly?: boolean;
}

export function FieldEditor({
  field,
  availableEarlierFields,
  onChange,
  readOnly = false,
}: FieldEditorProps) {
  const eligibleConditionFields = availableEarlierFields.filter(
    (f) => f.key !== field.key && (f.kind === 'boolean' || f.kind === 'select')
  );

  const handleUpdate = (patch: Partial<FormFieldType>) => {
    if (readOnly) return;
    onChange({ ...field, ...patch });
  };

  const handleAddOption = () => {
    const current = field.options || [];
    const nextIdx = current.length + 1;
    handleUpdate({
      options: [...current, { value: `option_${nextIdx}`, label: `Option ${nextIdx}` }],
    });
  };

  const handleUpdateOption = (index: number, patch: { value?: string; label?: string }) => {
    const current = [...(field.options || [])];
    current[index] = { ...current[index], ...patch };
    handleUpdate({ options: current });
  };

  const handleRemoveOption = (index: number) => {
    const current = (field.options || []).filter((_, i) => i !== index);
    handleUpdate({ options: current });
  };

  return (
    <div className="form-builder-field-editor">
      <div className="form-builder-input-grid">
        <FormField id="edit-field-label" label="Label" required>
          <Input
            id="edit-field-label"
            value={field.label}
            onChange={(e) => handleUpdate({ label: e.target.value })}
            placeholder="e.g. Coating Thickness"
            disabled={readOnly}
          />
        </FormField>

        <FormField id="edit-field-key" label="Field key" help="Stable identifier used in submissions." required>
          <Input
            id="edit-field-key"
            value={field.key}
            onChange={(e) =>
              handleUpdate({
                key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              })
            }
            placeholder="e.g. coating_thickness"
            disabled={readOnly}
          />
        </FormField>
      </div>

      <div className="form-builder-input-grid">
        <FormField id="edit-field-kind" label="Type" required>
          <Select
            id="edit-field-kind"
            value={field.kind}
            onChange={(e) => handleUpdate({ kind: e.target.value as FieldKind })}
            disabled={readOnly}
          >
            <option value="text">Text (Single Line)</option>
            <option value="textarea">Textarea (Multi-line)</option>
            <option value="decimal">Decimal Number</option>
            <option value="date">Date</option>
            <option value="select">Select (Single choice)</option>
            <option value="multiselect">Multi-select</option>
            <option value="boolean">Boolean (Checkbox)</option>
            <option value="attachment">File Attachment (PDF/Image)</option>
            <option value="reference">Master Entity Reference</option>
          </Select>
        </FormField>

        <div className="form-builder-required">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => handleUpdate({ required: e.target.checked })}
              disabled={readOnly}
              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-ink">Required for final submission</span>
          </label>
        </div>
      </div>

      <FormField id="edit-field-help" label="Instructions">
        <Textarea
          id="edit-field-help"
          value={field.helpText || ''}
          onChange={(e) => handleUpdate({ helpText: e.target.value })}
          placeholder="Guidance for operator / inspector…"
          rows={2}
          disabled={readOnly}
        />
      </FormField>

      {/* Select / Multiselect Options */}
      {(field.kind === 'select' || field.kind === 'multiselect') && (
        <div className="form-builder-subsection">
          <div className="flex items-center justify-between">
            <span className="form-builder-subheading">
              Choice options
            </span>
            {!readOnly && (
              <Button variant="soft" size="small" onClick={handleAddOption}>
                Add option
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {(field.options || []).map((opt, idx) => (
              <div key={idx} className="form-builder-option-row">
                <Input
                  value={opt.label}
                  onChange={(e) => handleUpdateOption(idx, { label: e.target.value })}
                  placeholder="Display label"
                  aria-label={`Option ${idx + 1} label`}
                  disabled={readOnly}
                />
                <Input
                  value={opt.value}
                  onChange={(e) => handleUpdateOption(idx, { value: e.target.value })}
                  placeholder="Stored value"
                  aria-label={`Option ${idx + 1} stored value`}
                  disabled={readOnly}
                />
                {!readOnly && (
                  <Button
                    variant="soft"
                    size="small"
                    onClick={() => handleRemoveOption(idx)}
                    aria-label={`Remove option ${idx + 1}`}
                    className="text-danger hover:bg-danger-soft"
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decimal Settings */}
      {field.kind === 'decimal' && (
        <div className="form-builder-number-grid">
          <FormField id="edit-field-precision" label="Precision (decimals)">
            <Input
              id="edit-field-precision"
              type="number"
              min={0}
              max={6}
              value={field.precision !== undefined ? field.precision : 2}
              onChange={(e) => handleUpdate({ precision: Number(e.target.value) })}
              disabled={readOnly}
            />
          </FormField>
          <FormField id="edit-field-min" label="Min Value">
            <Input
              id="edit-field-min"
              value={field.min || ''}
              onChange={(e) => handleUpdate({ min: e.target.value })}
              placeholder="e.g. 0.0"
              disabled={readOnly}
            />
          </FormField>
          <FormField id="edit-field-max" label="Max Value">
            <Input
              id="edit-field-max"
              value={field.max || ''}
              onChange={(e) => handleUpdate({ max: e.target.value })}
              placeholder="e.g. 100.0"
              disabled={readOnly}
            />
          </FormField>
        </div>
      )}

      {/* Visibility rules (visibleWhen) */}
      <div className="form-builder-subsection">
        <span className="form-builder-subheading">
          Visibility rules
        </span>

        {eligibleConditionFields.length === 0 ? (
          <p className="text-xs text-muted">
            Add an earlier boolean or select field to enable conditional visibility rules.
          </p>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(field.visibleWhen)}
                onChange={(e) => {
                  if (e.target.checked) {
                    const firstEligible = eligibleConditionFields[0];
                    handleUpdate({
                      visibleWhen: {
                        fieldKey: firstEligible.key,
                        operator: 'equals',
                        value:
                          firstEligible.kind === 'boolean'
                            ? true
                            : firstEligible.options?.[0]?.value || '',
                      },
                    });
                  } else {
                    handleUpdate({ visibleWhen: undefined });
                  }
                }}
                disabled={readOnly}
                className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
              />
              <span className="text-sm text-ink">Show this field conditionally</span>
            </label>

            {field.visibleWhen && (
              <div className="form-builder-condition-grid">
                <Select
                  value={field.visibleWhen.fieldKey}
                  onChange={(e) => {
                    const parent = eligibleConditionFields.find((f) => f.key === e.target.value);
                    if (parent) {
                      handleUpdate({
                        visibleWhen: {
                          fieldKey: parent.key,
                          operator: 'equals',
                          value: parent.kind === 'boolean' ? true : parent.options?.[0]?.value || '',
                        },
                      });
                    }
                  }}
                  disabled={readOnly}
                >
                  {eligibleConditionFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      When: {f.label} ({f.key})
                    </option>
                  ))}
                </Select>

                <Select
                  value={field.visibleWhen.operator}
                  onChange={(e) => {
                    if (field.visibleWhen) {
                      handleUpdate({
                        visibleWhen: {
                          ...field.visibleWhen,
                          operator: e.target.value as any,
                        },
                      });
                    }
                  }}
                  disabled={readOnly}
                >
                  <option value="equals">equals</option>
                  <option value="notEquals">not equals</option>
                </Select>

                {(() => {
                  const parent = eligibleConditionFields.find(
                    (f) => f.key === field.visibleWhen?.fieldKey
                  );
                  if (parent?.kind === 'boolean') {
                    return (
                      <Select
                        value={String(field.visibleWhen.value)}
                        onChange={(e) => {
                          if (field.visibleWhen) {
                            handleUpdate({
                              visibleWhen: {
                                ...field.visibleWhen,
                                value: e.target.value === 'true',
                              },
                            });
                          }
                        }}
                        disabled={readOnly}
                      >
                        <option value="true">True (Checked)</option>
                        <option value="false">False (Unchecked)</option>
                      </Select>
                    );
                  }
                  return (
                    <Select
                      value={String(field.visibleWhen.value)}
                      onChange={(e) => {
                        if (field.visibleWhen) {
                          handleUpdate({
                            visibleWhen: {
                              ...field.visibleWhen,
                              value: e.target.value,
                            },
                          });
                        }
                      }}
                      disabled={readOnly}
                    >
                      {parent?.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
