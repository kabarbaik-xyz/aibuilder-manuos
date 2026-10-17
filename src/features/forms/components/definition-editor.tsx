'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormTemplateDTO, FormVersionDTO } from '@/server/modules/forms/contracts';
import { FormDefinition, FormField as FormFieldType, Answers } from '@/domain/forms/types';
import { validateDefinition } from '@/domain/forms/schema';
import { useUpdateDraftVersion, useFormVersionAction, useForkFormVersion } from '../hooks';
import { FieldEditor } from './field-editor';
import { FormRenderer } from './form-renderer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { PageHeader } from '@/components/ui/page-header';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { Icon } from '@/components/icons';
import { GenerationPanel } from '@/features/builder-proposals/components/generation-panel';
import { ProposalReview } from '@/features/builder-proposals/components/proposal-review';
import { BuilderProposalDto } from '@/server/modules/builder-proposals/contracts';
import { WorkflowFormBindingPanel } from './workflow-form-binding-panel';

export interface FormDefinitionEditorProps {
  template: FormTemplateDTO;
  version: FormVersionDTO;
}

export function FormDefinitionEditor({ template, version }: FormDefinitionEditorProps) {
  const router = useRouter();
  const [definition, setDefinition] = useState<FormDefinition>(version.definition);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [activeTab, setActiveTab] = useState<'fields' | 'preview'>('fields');
  const [aiProposal, setAiProposal] = useState<BuilderProposalDto | null>(null);

  const updateDraftMutation = useUpdateDraftVersion(template.id, version.id);
  const actionMutation = useFormVersionAction(template.id, version.id);
  const forkMutation = useForkFormVersion(template.id);

  const isReadOnly = version.status === 'PUBLISHED' || version.status === 'RETIRED';

  // Live client validation of definition
  let validationError: string | null = null;
  try {
    validateDefinition(definition);
  } catch (err: any) {
    validationError = err.message;
  }

  const selectedField = definition.fields[selectedIndex];

  const handleAddField = () => {
    if (isReadOnly) return;
    const nextKeyNum = definition.fields.length + 1;
    const newField: FormFieldType = {
      key: `field_${nextKeyNum}`,
      label: `New Field ${nextKeyNum}`,
      kind: 'text',
      required: false,
    };
    const nextFields = [...definition.fields, newField];
    setDefinition({ ...definition, fields: nextFields });
    setSelectedIndex(nextFields.length - 1);
  };

  const handleRemoveField = (idx: number) => {
    if (isReadOnly) return;
    const nextFields = definition.fields.filter((_, i) => i !== idx);
    setDefinition({ ...definition, fields: nextFields });
    if (selectedIndex >= nextFields.length) {
      setSelectedIndex(Math.max(0, nextFields.length - 1));
    }
  };

  const handleMoveField = (idx: number, direction: 'up' | 'down') => {
    if (isReadOnly) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= definition.fields.length) return;

    const nextFields = [...definition.fields];
    const [moved] = nextFields.splice(idx, 1);
    nextFields.splice(targetIdx, 0, moved);
    setDefinition({ ...definition, fields: nextFields });
    setSelectedIndex(targetIdx);
  };

  const handleSaveDraft = () => {
    updateDraftMutation.mutate(
      {
        expectedVersion: version.version,
        definition,
      },
      {
        onSuccess: () => {
          router.refresh();
        },
      }
    );
  };

  const handleAction = (action: 'submit_review' | 'publish' | 'retire') => {
    actionMutation.mutate(
      {
        action,
        expectedVersion: version.version,
      },
      {
        onSuccess: () => {
          router.refresh();
        },
      }
    );
  };

  const handleFork = () => {
    forkMutation.mutate(version.id, {
      onSuccess: (res) => {
        if (res.data?.versionId) {
          router.push(`/settings/forms/${template.id}/versions/${res.data.versionId}`);
        }
      },
    });
  };

  return (
    <div className="page-stack form-builder">
      {/* Top Header & Actions */}
      <PageHeader
        title={template.name}
        description={<span className="form-builder-meta"><Badge variant={version.status === 'PUBLISHED' ? 'success' : version.status === 'REVIEW' ? 'warning' : 'default'}>{version.status.toLowerCase()}</Badge><span>Version {version.versionNumber}</span><span>{template.purpose.toLowerCase().replace(/_/g, ' ')}</span></span>}
        actions={
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <>
              <Button
                variant="default"
                onClick={handleSaveDraft}
                disabled={Boolean(validationError) || updateDraftMutation.isPending}
              >
                Save draft
              </Button>

              {version.status === 'DRAFT' && (
                <Button
                  variant="primary"
                  onClick={() => handleAction('submit_review')}
                  disabled={Boolean(validationError) || actionMutation.isPending}
                >
                  Submit for review
                </Button>
              )}

              {version.status === 'REVIEW' && (
                <Button
                  variant="primary"
                  onClick={() => handleAction('publish')}
                  disabled={Boolean(validationError) || actionMutation.isPending}
                >
                  Approve & publish
                </Button>
              )}
            </>
          )}

          {version.status === 'PUBLISHED' && (
            <>
              <Button variant="primary" onClick={handleFork} disabled={forkMutation.isPending}>
                Fork new version
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleAction('retire')}
                disabled={actionMutation.isPending}
              >
                Retire version
              </Button>
            </>
          )}
        </div>
        }
      />
      {version.status === 'PUBLISHED' && template.purpose === 'TASK_EVIDENCE' && <WorkflowFormBindingPanel formVersionId={version.id} />}
      <FormErrorSummary error={updateDraftMutation.error || actionMutation.error || forkMutation.error} />

      {/* Validation Issue Banner */}
      {validationError && (
        <div className="rounded-md border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
          <strong>Schema validation issue:</strong> {validationError}
        </div>
      )}

      {isReadOnly && (
        <div className="form-builder-notice"><Icon name="shield" /><div><strong>{version.status === 'PUBLISHED' ? 'Published version' : 'Retired version'} · Read only</strong><p>{version.status === 'PUBLISHED' ? 'Explore the fields and test the preview. Fork a new version to make changes.' : 'This version is retained for reference. Its field definition cannot be changed.'}</p></div></div>
      )}

      {/* AI Form Assistant */}
      {!isReadOnly && (
        <details className="form-builder-assistant">
          <summary><span><Icon name="spark" />Draft with AI<span className="form-builder-optional">Optional</span></span><Icon name="down" /></summary>
          <div className="form-builder-assistant-body">
          {!aiProposal ? (
            <GenerationPanel
              target="FORM"
              embedded
              targetDraftId={version.id}
              baseRevision={version.versionNumber}
              onGenerated={(prop) => setAiProposal(prop)}
            />
          ) : (
            <ProposalReview
              proposal={aiProposal}
              expectedTargetRevision={version.versionNumber}
              currentDefinition={definition}
              onApplied={() => {
                setAiProposal(null);
                try {
                  const candidate = JSON.parse(aiProposal.candidateJson);
                  setDefinition(candidate);
                } catch {
                  // ignore
                }
                router.refresh();
              }}
              onDiscard={() => setAiProposal(null)}
            />
          )}
          </div>
        </details>
      )}

      {/* One workbench keeps the field outline beside a focused configuration or preview. */}
      <Panel className="form-builder-workbench">
        <div className="form-builder-toolbar">
          <div><strong>Form builder</strong><span>{definition.fields.length} {definition.fields.length === 1 ? 'field' : 'fields'}</span></div>
          <div className="form-builder-tabs" role="group" aria-label="Editor view"><Button variant={activeTab === 'fields' ? 'default' : 'ghost'} aria-pressed={activeTab === 'fields'} onClick={() => setActiveTab('fields')}>Configure</Button><Button variant={activeTab === 'preview' ? 'default' : 'ghost'} aria-pressed={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>Preview</Button></div>
        </div>
        <div className={`form-builder-layout form-builder-view-${activeTab}`}>
          {/* Fields list */}
          <aside className="form-builder-fields" aria-label="Form fields">
            <div className="form-builder-panel-header"><h2>Fields</h2>{!isReadOnly && <Button variant="ghost" size="small" icon="plus" onClick={() => { handleAddField(); setActiveTab('fields'); }}>Add field</Button>}</div>
            <div className="form-builder-field-list">
              {definition.fields.map((field, idx) => (
                <div key={field.key} className={`form-builder-field ${selectedIndex === idx ? 'is-selected' : ''}`}>
                  <button type="button" className="form-builder-field-select" aria-pressed={selectedIndex === idx} onClick={() => { setSelectedIndex(idx); setActiveTab('fields'); }}><span className="form-builder-field-number">{idx + 1}</span><span><strong>{field.label}</strong><small>{field.kind === 'textarea' ? 'Long text' : field.kind === 'select' ? 'Single choice' : field.kind.replace(/_/g, ' ')}{field.required ? ' · Required' : ''}</small></span></button>
                  {!isReadOnly && selectedIndex === idx && <div className="form-builder-field-actions"><Button variant="icon" aria-label={`Move ${field.label} up`} title="Move up" disabled={idx === 0} onClick={() => handleMoveField(idx, 'up')}><Icon name="chevron" className="form-builder-up" /></Button><Button variant="icon" aria-label={`Move ${field.label} down`} title="Move down" disabled={idx === definition.fields.length - 1} onClick={() => handleMoveField(idx, 'down')}><Icon name="chevron" className="form-builder-down" /></Button><Button variant="icon" aria-label={`Remove ${field.label}`} title="Remove field" onClick={() => handleRemoveField(idx)}><Icon name="close" /></Button></div>}
                </div>
              ))}
              {!definition.fields.length && <p className="field-help form-builder-empty">Add your first field to start building this form.</p>}
            </div>
          </aside>

          {/* Field configuration */}
          <section className="form-builder-config" aria-label="Field configuration">
            <div className="form-builder-panel-header"><div><h2>{selectedField?.label || 'Field settings'}</h2><p>{selectedField ? `Field ${selectedIndex + 1} of ${definition.fields.length}` : 'Select a field from the outline.'}</p></div>{isReadOnly && <Badge>Read only</Badge>}</div>
            <div className="form-builder-panel-body">{selectedField ? <FieldEditor field={selectedField} availableEarlierFields={definition.fields.slice(0, selectedIndex)} onChange={updated => { const nextFields = [...definition.fields]; nextFields[selectedIndex] = updated; setDefinition({ ...definition, fields: nextFields }); }} readOnly={isReadOnly} /> : <div className="form-builder-empty"><h3>Build your form</h3><p>Add a field to configure its label, type and rules.</p>{!isReadOnly && <Button variant="soft" icon="plus" onClick={handleAddField}>Add first field</Button>}</div>}</div>
          </section>

          {/* Preview uses the full main canvas instead of competing with the configuration. */}
          <section className="form-builder-preview" aria-label="Form preview">
            <div className="form-builder-panel-header"><div><h2>Form preview</h2><p>Check the respondent experience.</p></div><Button variant="ghost" size="small" onClick={() => setPreviewAnswers({})}>Reset answers</Button></div>
            <div className="form-builder-panel-body"><h3 className="form-builder-preview-title">{template.name}</h3><FormRenderer definition={definition} value={previewAnswers} onChange={setPreviewAnswers} /><p className="form-builder-preview-note">Preview only. Answers are not submitted.</p></div>
          </section>
        </div>
      </Panel>
    </div>
  );
}
