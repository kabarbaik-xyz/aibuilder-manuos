'use client';

import React, { useEffect, useId, useState } from 'react';
import { FormDefinition, Answers, FormIssue } from '@/domain/forms/types';
import { evaluateVisibility } from '@/domain/forms/conditions';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';

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
  const rendererId = useId().replace(/:/g, '');
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
        const inputId = `form-${rendererId}-field-${field.key}`;

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
                <DatePicker
                  id={inputId}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(next) => handleFieldChange(field.key, next)}
                  aria-invalid={Boolean(issue)}
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
            case 'multiselect': {
              const selected = Array.isArray(val) ? val : [];
              return (
                <fieldset className="space-y-2" disabled={readOnly} aria-describedby={issue ? `${inputId}-error` : undefined}>
                  <legend className="sr-only">{field.label}</legend>
                  {field.options?.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.value)}
                        onChange={(event) => handleFieldChange(field.key, event.target.checked
                          ? [...selected, option.value]
                          : selected.filter((item) => item !== option.value))}
                        className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>
              );
            }
            case 'attachment':
              return <AttachmentControl value={Array.isArray(val) ? val : []} onChange={(next) => handleFieldChange(field.key, next)} readOnly={readOnly} />;
            case 'reference':
              return (
                <ReferenceControl
                  id={inputId}
                  referenceType={field.referenceType ?? 'item'}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(next) => handleFieldChange(field.key, next)}
                  disabled={readOnly}
                />
              );
            default:
              return <span />;
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

function ReferenceControl({ id, referenceType, value, onChange, disabled }: {
  id: string;
  referenceType: 'customer' | 'item' | 'machine';
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    const endpoint = referenceType === 'customer' ? '/api/customers'
      : referenceType === 'machine' ? '/api/resources/machines' : '/api/items';
    let active = true;
    fetch(endpoint).then(async (response) => {
      if (!response.ok) throw new Error('Reference list unavailable');
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      if (active) setOptions(rows.map((row: any) => ({
        id: row.id,
        label: [row.code, row.name].filter(Boolean).join(' · ') || row.name || row.id,
      })));
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [referenceType]);

  return (
    <div className="space-y-1">
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">Pilih {referenceType === 'customer' ? 'pelanggan' : referenceType === 'machine' ? 'mesin' : 'barang'}…</option>
        {value && !options.some((option) => option.id === value) && <option value={value}>Referensi tersimpan</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Select>
      {loadError && <span className="text-xs text-danger">Daftar referensi tidak dapat dimuat.</span>}
    </div>
  );
}

function AttachmentControl({ value, onChange, readOnly }: { value: string[]; onChange: (next: string[]) => void; readOnly: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    if (value.length + files.length > 5) {
      setError('Maksimal 5 file untuk satu field.');
      return;
    }
    setUploading(true);
    try {
      const documentIds: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: ukuran maksimum 10 MB.`);
        if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) throw new Error(`${file.name}: gunakan PDF, PNG, atau JPEG.`);
        const form = new FormData();
        form.set('file', file);
        const response = await fetch('/api/documents/upload', { method: 'POST', body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.id) throw new Error(payload.error?.message || `Gagal mengunggah ${file.name}.`);
        documentIds.push(payload.id);
      }
      onChange([...value, ...documentIds]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload file gagal.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {!readOnly && <Input type="file" accept="application/pdf,image/png,image/jpeg" multiple disabled={uploading || value.length >= 5} onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} />}
      {uploading && <p className="text-xs text-muted">Mengunggah bukti…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {value.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {value.map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-muted px-3 py-2">
              <a className="min-w-0 truncate text-primary hover:underline" href={`/api/documents/${encodeURIComponent(id)}/download`} target="_blank" rel="noreferrer">Buka dokumen</a>
              {!readOnly && <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => onChange(value.filter((item) => item !== id))}>Hapus</button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted">{readOnly ? 'Tidak ada dokumen terlampir.' : 'PDF, PNG, atau JPEG · maks. 10 MB per file · hingga 5 file.'}</p>}
    </div>
  );
}
