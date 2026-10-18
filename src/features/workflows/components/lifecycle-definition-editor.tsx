'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { useSaveWorkflowVersionDraft, useWorkflowVersionAction } from '../hooks';
import { WorkflowTemplateDto, WorkflowVersionDto } from '../api';
import { LIFECYCLE_ACTIONS, OrderLifecycleDefinition, LifecycleAction, validateLifecycleDefinition } from '@/domain/order-lifecycle-definition';

interface DepartmentOption { id: string; name: string }
interface RoleOption { id: string; code: string; name: string; isActive: boolean }
interface MemberOption { membershipId: string; name: string; roles: Array<{ code: string; name: string }> }
interface FormOption { id: string; code: string; name: string; purpose: string; publishedVersion?: { id: string; versionNumber: number; contentHash: string } }
interface FormFieldOption { key: string; label: string; kind: string; options?: Array<{ value: string; label: string }> }
interface FormVersionDetail { id: string; definition: { fields: FormFieldOption[] } }

const actionLabels: Record<LifecycleAction, string> = {
  ORDER_CONFIRM: 'Confirm customer order', ENGINEERING_APPROVE: 'Approve engineering',
  PLAN_PRODUCTION: 'Plan production', EXECUTE_PRODUCTION: 'Complete production work',
  FINALIZE_QC: 'Finalize quality inspection', CONFIRM_DELIVERY: 'Confirm delivery', REVIEW_EVIDENCE: 'Review evidence',
};

export function LifecycleDefinitionEditor({ template, version, departments }: {
  template: WorkflowTemplateDto; version: WorkflowVersionDto; departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [definition, setDefinition] = useState<OrderLifecycleDefinition>(() => {
    try { return JSON.parse(version.definitionJson) as OrderLifecycleDefinition; }
    catch { return { schemaVersion: 1, name: template.name, stages: [] }; }
  });
  const saveMutation = useSaveWorkflowVersionDraft(template.id, version.id);
  const actionMutation = useWorkflowVersionAction(template.id, version.id);
  const readOnly = version.status === 'PUBLISHED' || version.status === 'RETIRED';
  const roles = useQuery({ queryKey: ['workflow-lifecycle-roles'], queryFn: () => apiRequest<{ data: RoleOption[] }>('/api/roles') });
  const forms = useQuery({ queryKey: ['workflow-lifecycle-forms'], queryFn: () => apiRequest<{ data: FormOption[] }>('/api/forms') });
  const formDefinitions = useQuery({
    queryKey: ['workflow-lifecycle-form-definitions', forms.data?.data.map(form => form.publishedVersion?.id ?? '').join('|')],
    queryFn: async () => {
      const publishedForms = (forms.data?.data ?? []).filter(form => form.publishedVersion);
      const results = await Promise.all(publishedForms.map(async form => {
        const response = await apiRequest<{ data: { versions: FormVersionDetail[] } }>(`/api/forms/${form.id}`);
        return [form.publishedVersion!.id, response.data.versions.find(version => version.id === form.publishedVersion!.id)?.definition] as const;
      }));
      return new Map(results.filter(([, definition]) => Boolean(definition)).map(([id, definition]) => [id, definition!]));
    },
    enabled: Boolean(forms.data?.data.length),
  });
  const members = useQuery({
    queryKey: ['workflow-lifecycle-members', definition.stages.map(stage => stage.departmentId).join('|')],
    queryFn: async () => {
      const departmentIds = [...new Set(definition.stages.map(stage => stage.departmentId).filter(Boolean))];
      const results = await Promise.all(departmentIds.map(async departmentId => {
        const response = await apiRequest<{ data: MemberOption[] }>(`/api/workflows/lifecycle-members?departmentId=${encodeURIComponent(departmentId)}`);
        return [departmentId, response.data] as const;
      }));
      return new Map(results);
    },
    enabled: Boolean(template.id && !readOnly),
  });
  const validation = useMemo(() => validateLifecycleDefinition(definition), [definition]);

  const updateStage = (key: string, update: (stage: OrderLifecycleDefinition['stages'][number]) => OrderLifecycleDefinition['stages'][number]) => {
    setDefinition(current => ({ ...current, stages: current.stages.map(stage => stage.key === key ? update(stage) : stage) }));
  };
  const addStage = () => {
    let index = definition.stages.length + 1;
    while (definition.stages.some(stage => stage.key === `STAGE-${String(index).padStart(2, '0')}`)) index++;
    const key = `STAGE-${String(index).padStart(2, '0')}`;
    const departmentId = departments[0]?.id ?? '';
    const roleCode = roles.data?.data.find(role => role.isActive)?.code;
    setDefinition(current => ({ ...current, stages: [...current.stages, {
      key, name: 'New lifecycle stage', action: 'REVIEW_EVIDENCE', departmentId,
      assignment: { kind: 'DEPARTMENT_QUEUE', departmentId, eligibleRoleCodes: roleCode ? [roleCode] : [] },
      schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 },
      predecessors: current.stages.length ? [current.stages[current.stages.length - 1].key] : [], forms: [],
    }] }));
  };
  const updateAction = (key: string, action: LifecycleAction) => updateStage(key, stage => ({ ...stage, action,
    schedule: action === 'PLAN_PRODUCTION' || action === 'EXECUTE_PRODUCTION'
      ? { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' }
      : { kind: 'DEADLINE', dueAfterMinutes: 480 },
  }));
  const toggleRole = (key: string, roleCode: string) => updateStage(key, stage => {
    const selected = stage.assignment.kind === 'DEPARTMENT_QUEUE' ? stage.assignment.eligibleRoleCodes : [];
    const eligibleRoleCodes = selected.includes(roleCode) ? selected.filter(code => code !== roleCode) : [...selected, roleCode];
    return { ...stage, assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: stage.departmentId, eligibleRoleCodes } };
  });
  const applicableForms = (action: LifecycleAction) => {
    const purposes = action === 'FINALIZE_QC' ? ['QC_EVIDENCE'] : action === 'ORDER_CONFIRM' || action === 'ENGINEERING_APPROVE' || action === 'CONFIRM_DELIVERY' || action === 'REVIEW_EVIDENCE' ? ['ORDER_SPEC'] : ['TASK_EVIDENCE'];
    return (forms.data?.data ?? []).filter(form => purposes.includes(form.purpose) && form.publishedVersion);
  };
  const branchSourceForms = (stage: OrderLifecycleDefinition['stages'][number]) => definition.stages
    .filter(candidate => stage.predecessors.includes(candidate.key))
    .flatMap(source => source.forms
      .filter(pin => forms.data?.data.find(form => form.publishedVersion?.id === pin.formVersionId)?.purpose === 'ORDER_SPEC')
      .map(pin => ({ source, pin, fields: formDefinitions.data?.get(pin.formVersionId)?.fields.filter(field => field.kind === 'select') ?? [] })));
  const updateBranchCondition = (key: string, condition: NonNullable<OrderLifecycleDefinition['stages'][number]['activationCondition']> | undefined) =>
    updateStage(key, current => ({ ...current, activationCondition: condition }));
  const toggleForm = (key: string, form: FormOption) => updateStage(key, stage => {
    const formVersionId = form.publishedVersion?.id;
    if (!formVersionId || !form.publishedVersion) return stage;
    const forms = stage.forms.some(pin => pin.formVersionId === formVersionId)
      ? stage.forms.filter(pin => pin.formVersionId !== formVersionId)
      : [...stage.forms, { formVersionId, contentHash: form.publishedVersion.contentHash, required: true, completionPoint: 'BEFORE_STAGE_COMPLETION' as const }];
    return { ...stage, forms };
  });
  const runAction = (action: 'submit_review' | 'publish' | 'fork' | 'retire') => actionMutation.mutate(action, {
    onSuccess: (result: any) => { if (action === 'fork' && result.data?.id) router.push(`/workflows/${template.id}/versions/${result.data.id}`); },
  });

  return <div className="page-stack">
    <header className="page-header"><div><h1>{template.name}</h1><p className="muted">Order lifecycle · {template.orderType?.name ?? 'Order type'} · version {version.versionNumber}</p></div><Badge variant={version.status === 'PUBLISHED' ? 'success' : 'default'}>{version.status}</Badge></header>
    <section className="form-section page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2>Cross-department stages</h2><p className="field-help">Define the owner queue, handoff, schedule policy and published forms for each stage.</p></div>
        {!readOnly ? <div className="flex gap-2"><Button onClick={addStage} disabled={!departments.length || roles.isPending}>Add stage</Button><Button variant="primary" onClick={() => saveMutation.mutate({ expectedVersion: version.version, definition })} disabled={saveMutation.isPending || !validation.isValid}>{saveMutation.isPending ? 'Saving…' : 'Save draft'}</Button><Button variant="soft" onClick={() => runAction('publish')} disabled={actionMutation.isPending || !validation.isValid}>Publish</Button></div>
          : <div className="flex gap-2"><Button onClick={() => runAction('fork')}>Fork new version</Button><Button variant="ghost" onClick={() => runAction('retire')}>Retire</Button></div>}
      </div>
      <FormField id="lifecycle-name" label="Workflow name" required><Input value={definition.name} onChange={event => setDefinition(current => ({ ...current, name: event.target.value }))} disabled={readOnly} /></FormField>
      {!validation.isValid && <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm"><strong>Fix these before publish</strong><ul className="mt-2 list-disc pl-5">{validation.errors.map((error, index) => <li key={`${error.code}-${index}`}>{error.stageKey ? `${error.stageKey}: ` : ''}{error.message}</li>)}</ul></div>}
      {definition.stages.map((stage, index) => {
        const compatibleForms = applicableForms(stage.action);
        const compatibleFormIds = new Set(compatibleForms.map(form => form.publishedVersion?.id));
        const visibleForms = (forms.data?.data ?? []).filter(form => form.publishedVersion && (compatibleFormIds.has(form.publishedVersion.id) || stage.forms.some(pin => pin.formVersionId === form.publishedVersion?.id)));
        const successors = definition.stages.filter(candidate => candidate.predecessors.includes(stage.key));
        const assignedMembershipId = stage.assignment.kind === 'MEMBER' ? stage.assignment.membershipId : null;
        const assignedMember = stage.assignment.kind === 'MEMBER'
          ? members.data?.get(stage.departmentId)?.find(member => member.membershipId === assignedMembershipId)
          : null;
        const assignmentPreview = stage.assignment.kind === 'MEMBER'
          ? assignedMember?.name ?? 'specific department member'
          : `${departments.find(department => department.id === stage.departmentId)?.name ?? 'department queue'} · ${stage.assignment.eligibleRoleCodes.map(code => roles.data?.data.find(role => role.code === code)?.name ?? code).join(', ') || 'no eligible role selected'}`;
        const formPreview = stage.forms.map(pin => {
          const selectedForm = (forms.data?.data ?? []).find(form => form.publishedVersion?.id === pin.formVersionId);
          return `${selectedForm?.name ?? 'Unavailable pinned form'} (${pin.required ? 'required' : 'optional'})`;
        });
        return <article key={stage.key} className="rounded-xl border border-line bg-surface p-4 page-stack">
          <div className="flex items-start justify-between gap-3"><div><p className="small muted">Stage {index + 1} · {stage.key}</p><h3 className="text-base font-semibold">{stage.name}</h3></div>{!readOnly && <Button variant="ghost" onClick={() => setDefinition(current => ({ ...current, stages: current.stages.filter(item => item.key !== stage.key).map(item => ({ ...item, predecessors: item.predecessors.filter(key => key !== stage.key) })) }))}>Remove</Button>}</div>
          <div className="form-grid">
            <FormField id={`${stage.key}-name`} label="Stage name" required><Input value={stage.name} onChange={event => updateStage(stage.key, current => ({ ...current, name: event.target.value }))} disabled={readOnly} /></FormField>
            <FormField id={`${stage.key}-action`} label="Stage action" required><Select value={stage.action} onChange={event => updateAction(stage.key, event.target.value as LifecycleAction)} disabled={readOnly}>{LIFECYCLE_ACTIONS.map(action => <option key={action} value={action}>{actionLabels[action]}</option>)}</Select></FormField>
            <FormField id={`${stage.key}-department`} label="Owning department" required><Select value={stage.departmentId} onChange={event => updateStage(stage.key, current => ({ ...current, departmentId: event.target.value, assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: event.target.value, eligibleRoleCodes: current.assignment.kind === 'DEPARTMENT_QUEUE' ? current.assignment.eligibleRoleCodes : [] } }))} disabled={readOnly}><option value="">Choose department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></FormField>
            <div className="page-stack"><FormField id={`${stage.key}-assignment-kind`} label="Assignment" required><Select value={stage.assignment.kind} onChange={event => updateStage(stage.key, current => ({ ...current, assignment: event.target.value === 'MEMBER' ? { kind: 'MEMBER', membershipId: '', departmentId: current.departmentId } : { kind: 'DEPARTMENT_QUEUE', departmentId: current.departmentId, eligibleRoleCodes: [] } }))} disabled={readOnly}><option value="DEPARTMENT_QUEUE">Eligible department queue</option><option value="MEMBER">Specific person</option></Select></FormField>
              {stage.assignment.kind === 'MEMBER' ? <FormField id={`${stage.key}-member`} label="Assigned person" required><div><Select value={stage.assignment.membershipId} onChange={event => updateStage(stage.key, current => current.assignment.kind === 'MEMBER' ? { ...current, assignment: { ...current.assignment, membershipId: event.target.value } } : current)} disabled={readOnly || members.isPending}><option value="">Choose active department member</option>{(members.data?.get(stage.departmentId) ?? []).map(member => <option key={member.membershipId} value={member.membershipId}>{member.name}{member.roles.length ? ` · ${member.roles.map(role => role.name).join(', ')}` : ''}</option>)}</Select>{members.error && <p role="alert" className="text-xs text-danger">Department members could not be loaded.</p>}</div></FormField>
                : <fieldset><legend className="form-label">Eligible role queue</legend><div className="grid gap-2 sm:grid-cols-2">{(roles.data?.data ?? []).filter(role => role.isActive).map(role => <label key={role.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stage.assignment.kind === 'DEPARTMENT_QUEUE' && stage.assignment.eligibleRoleCodes.includes(role.code)} onChange={() => toggleRole(stage.key, role.code)} disabled={readOnly} />{role.name}</label>)}</div></fieldset>}</div>
          </div>
          <div className="form-grid">
            <div className="page-stack"><FormField id={`${stage.key}-schedule`} label="Scheduling policy"><Select value={stage.schedule.kind} onChange={event => updateStage(stage.key, current => ({ ...current, schedule: event.target.value === 'RESOURCE_CAPACITY' ? { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' } : { kind: 'DEADLINE', dueAfterMinutes: 480 } }))} disabled={readOnly || stage.action === 'PLAN_PRODUCTION' || stage.action === 'EXECUTE_PRODUCTION'}><option value="DEADLINE">Owner deadline</option><option value="RESOURCE_CAPACITY">Production capacity from approved routing</option></Select></FormField>{stage.schedule.kind === 'DEADLINE' && <FormField id={`${stage.key}-deadline`} label="Deadline (minutes)"><Input type="number" min={1} value={stage.schedule.dueAfterMinutes} onChange={event => updateStage(stage.key, current => ({ ...current, schedule: { kind: 'DEADLINE', dueAfterMinutes: Number(event.target.value) } }))} disabled={readOnly} /></FormField>}</div>
            <fieldset><legend className="form-label">Starts after</legend><div className="grid gap-2 sm:grid-cols-2">{definition.stages.filter(candidate => candidate.key !== stage.key).map(candidate => <label key={candidate.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stage.predecessors.includes(candidate.key)} onChange={event => updateStage(stage.key, current => ({ ...current, predecessors: event.target.checked ? [...current.predecessors, candidate.key] : current.predecessors.filter(key => key !== candidate.key) }))} disabled={readOnly} />{candidate.name}</label>)}</div></fieldset>
          </div>
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="form-label px-1">Branch routing</legend>
            <p className="field-help">A condition reads a finalized select answer from a pinned order form on a direct predecessor. If it does not match, this stage is skipped.</p>
            <FormField id={`${stage.key}-branch-mode`} label="When this stage becomes eligible">
              <Select value={stage.activationCondition ? 'condition' : 'always'} onChange={event => {
                if (event.target.value === 'always') updateBranchCondition(stage.key, undefined);
                else if (!stage.activationCondition) {
                  const first = branchSourceForms(stage)[0];
                  if (first?.fields[0]) updateBranchCondition(stage.key, {
                    sourceStageKey: first.source.key, formVersionId: first.pin.formVersionId,
                    fieldKey: first.fields[0].key, operator: 'EQUALS', value: first.fields[0].options?.[0]?.value ?? '',
                  });
                }
              }} disabled={readOnly}>
                <option value="always">Always, after predecessors finish</option>
                <option value="condition" disabled={!branchSourceForms(stage).some(option => option.fields.length)}>Only when a form answer matches</option>
              </Select>
            </FormField>
            {stage.activationCondition && <div className="form-grid mt-3">
              <FormField id={`${stage.key}-branch-source`} label="Predecessor form" required>
                <Select value={`${stage.activationCondition.sourceStageKey}|${stage.activationCondition.formVersionId}`} onChange={event => {
                  const selected = branchSourceForms(stage).find(option => `${option.source.key}|${option.pin.formVersionId}` === event.target.value);
                  if (selected?.fields[0]) updateBranchCondition(stage.key, {
                    ...stage.activationCondition!, sourceStageKey: selected.source.key, formVersionId: selected.pin.formVersionId,
                    fieldKey: selected.fields[0].key, value: selected.fields[0].options?.[0]?.value ?? '',
                  });
                }} disabled={readOnly || formDefinitions.isPending}>
                  {branchSourceForms(stage).map(option => <option key={`${option.source.key}|${option.pin.formVersionId}`} value={`${option.source.key}|${option.pin.formVersionId}`}>{option.source.name} · {forms.data?.data.find(form => form.publishedVersion?.id === option.pin.formVersionId)?.name}</option>)}
                </Select>
              </FormField>
              {(() => {
                const selected = branchSourceForms(stage).find(option => option.source.key === stage.activationCondition?.sourceStageKey && option.pin.formVersionId === stage.activationCondition?.formVersionId);
                const fields = selected?.fields ?? [];
                const field = fields.find(option => option.key === stage.activationCondition?.fieldKey) ?? fields[0];
                const values = field?.options ?? [];
                return <>
                  <FormField id={`${stage.key}-branch-field`} label="Form question" required>
                    <Select value={stage.activationCondition!.fieldKey} onChange={event => {
                      const nextField = fields.find(option => option.key === event.target.value);
                      updateBranchCondition(stage.key, { ...stage.activationCondition!, fieldKey: event.target.value, value: nextField?.options?.[0]?.value ?? '' });
                    }} disabled={readOnly || !fields.length}>
                      {fields.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </Select>
                  </FormField>
                  <FormField id={`${stage.key}-branch-operator`} label="Answer rule" required>
                    <Select value={stage.activationCondition!.operator} onChange={event => updateBranchCondition(stage.key, { ...stage.activationCondition!, operator: event.target.value as 'EQUALS' | 'NOT_EQUALS' | 'IN', value: event.target.value === 'IN' ? [values[0]?.value ?? ''] : values[0]?.value ?? '' })} disabled={readOnly}>
                      <option value="EQUALS">is</option><option value="NOT_EQUALS">is not</option><option value="IN">is one of</option>
                    </Select>
                  </FormField>
                  <FormField id={`${stage.key}-branch-value`} label="Answer value" required>
                    {stage.activationCondition!.operator === 'IN' ? <div className="grid gap-2 rounded-lg border border-line p-3">
                      {values.map(option => <label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(stage.activationCondition!.value) && stage.activationCondition!.value.includes(option.value)} onChange={event => {
                        const currentValues = Array.isArray(stage.activationCondition!.value) ? stage.activationCondition!.value : [];
                        const nextValues = event.target.checked ? [...currentValues, option.value] : currentValues.filter(value => value !== option.value);
                        updateBranchCondition(stage.key, { ...stage.activationCondition!, value: nextValues });
                      }} disabled={readOnly} />{option.label}</label>)}
                    </div> : <Select value={String(stage.activationCondition!.value)} onChange={event => updateBranchCondition(stage.key, { ...stage.activationCondition!, value: event.target.value })} disabled={readOnly || !values.length}>
                      {values.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>}
                  </FormField>
                </>;
              })()}
            </div>}
          </fieldset>
          <fieldset><legend className="form-label">Published forms</legend><p className="field-help">Choose version-pinned evidence for this stage. Forms stay attached to the published workflow version.</p><div className="grid gap-3 sm:grid-cols-2">{visibleForms.map(form => {
            const formVersion = form.publishedVersion!;
            const pin = stage.forms.find(candidate => candidate.formVersionId === formVersion.id);
            const compatible = compatibleFormIds.has(formVersion.id);
            return <div key={formVersion.id} className="rounded-lg border border-line p-3 text-sm">
              <label className="flex items-start gap-2"><input type="checkbox" checked={Boolean(pin)} onChange={() => toggleForm(stage.key, form)} disabled={readOnly || (!compatible && !pin)} /><span><strong>{form.name}</strong><span className="block muted">{form.code} · v{formVersion.versionNumber} · {formVersion.contentHash.slice(0, 10)}</span>{!compatible && <span className="block text-warning">Purpose is incompatible with this action. Remove this pin or change the action.</span>}</span></label>
              {pin && <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <FormField id={`${stage.key}-${formVersion.id}-required`} label="Requirement"><Select value={pin.required ? 'required' : 'optional'} onChange={event => updateStage(stage.key, current => ({ ...current, forms: current.forms.map(candidate => candidate.formVersionId === formVersion.id ? { ...candidate, required: event.target.value === 'required' } : candidate) }))} disabled={readOnly}><option value="required">Required</option><option value="optional">Optional</option></Select></FormField>
                <FormField id={`${stage.key}-${formVersion.id}-completion`} label="Complete evidence"><Select value={pin.completionPoint} onChange={event => updateStage(stage.key, current => ({ ...current, forms: current.forms.map(candidate => candidate.formVersionId === formVersion.id ? { ...candidate, completionPoint: event.target.value as 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' } : candidate) }))} disabled={readOnly}><option value="BEFORE_ACTION">Before stage action</option><option value="BEFORE_STAGE_COMPLETION">Before stage completion</option></Select></FormField>
              </div>}
            </div>;
          })}{visibleForms.length === 0 && <p className="field-help">No published compatible form is available for this action.</p>}</div></fieldset>
          <aside className="rounded-lg border border-primary/20 bg-primary-soft p-3 text-sm" aria-label={`Execution preview for ${stage.name}`}>
            <h4 className="font-semibold text-ink">Execution preview</h4>
            <p className="mt-1 text-muted">When ready, <span className="font-medium text-ink">{assignmentPreview}</span> in <span className="font-medium text-ink">{departments.find(department => department.id === stage.departmentId)?.name ?? 'the selected department'}</span> handles “{stage.name}” ({actionLabels[stage.action]}).</p>
            <p className="mt-1 text-muted">Evidence: {formPreview.length ? formPreview.join(' · ') : 'no form attached'}.</p>
            {stage.activationCondition && <p className="mt-1 text-muted">Branch rule: {branchSourceForms(stage).find(option => option.source.key === stage.activationCondition?.sourceStageKey && option.pin.formVersionId === stage.activationCondition?.formVersionId)?.fields.find(field => field.key === stage.activationCondition?.fieldKey)?.label ?? stage.activationCondition.fieldKey} {stage.activationCondition.operator === 'EQUALS' ? 'is' : stage.activationCondition.operator === 'NOT_EQUALS' ? 'is not' : 'is one of'} “{Array.isArray(stage.activationCondition.value) ? stage.activationCondition.value.join(', ') : stage.activationCondition.value}”; otherwise this stage is skipped.</p>}
            <p className="mt-1 text-muted">Scheduling: {stage.schedule.kind === 'DEADLINE' ? `owner deadline ${stage.schedule.dueAfterMinutes} minutes after activation` : 'real production capacity through Planning after Engineering approval'}.</p>
            <p className="mt-1 text-muted">Next: {successors.length ? successors.map(successor => successor.name).join(', ') : 'workflow ends after this stage'}{successors.length > 1 ? ' (parallel successors; each also waits for its other predecessors)' : ''}.</p>
            {stage.schedule.kind === 'RESOURCE_CAPACITY' && <p className="mt-1 text-xs text-muted">Preview does not reserve capacity. Planning revalidates resources, skills, shifts, material and bookings.</p>}
          </aside>
        </article>;
      })}
      {(saveMutation.error || actionMutation.error) && <p role="alert" className="text-sm text-danger">{(saveMutation.error || actionMutation.error)?.message}</p>}
      {roles.error && <p role="alert" className="text-sm text-danger">Role list unavailable. Stage ownership cannot be configured.</p>}
      {forms.error && <p role="alert" className="text-sm text-danger">Published forms could not be loaded.</p>}
    </section>
  </div>;
}
