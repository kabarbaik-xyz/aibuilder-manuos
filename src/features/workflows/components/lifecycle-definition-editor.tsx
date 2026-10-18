'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import './workflow-editor.css';
import { apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/dialog';
import { Tabs } from '@/components/ui/tabs';
import { useSaveWorkflowVersionDraft, useWorkflowVersionAction } from '../hooks';
import { WorkflowTemplateDto, WorkflowVersionDto } from '../api';
import { lifecycleVersionActions } from '../lifecycle-version-actions';
import { LifecycleWorkflowMap } from './lifecycle-workflow-map';
import { LIFECYCLE_ACTIONS, QC_LIFECYCLE_OUTCOMES, OrderLifecycleDefinition, LifecycleAction, FormAnswerBranchCondition, validateLifecycleDefinition } from '@/domain/order-lifecycle-definition';

interface DepartmentOption { id: string; name: string }
interface RoleOption { code: string; name: string; isActive: boolean }
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
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);
  const [dialogBaseline, setDialogBaseline] = useState<OrderLifecycleDefinition | null>(null);
  const [stageSection, setStageSection] = useState<'general' | 'routing' | 'forms'>('general');
  const [activeView, setActiveView] = useState<'map' | 'edit'>('map');
  const saveMutation = useSaveWorkflowVersionDraft(template.id, version.id);
  const actionMutation = useWorkflowVersionAction(template.id, version.id);
  const versionActions = lifecycleVersionActions(version.status);
  const readOnly = !versionActions.canEdit;
  const roles = useQuery({ queryKey: ['workflow-lifecycle-roles'], queryFn: () => apiRequest<{ data: RoleOption[] }>('/api/workflows/lifecycle-roles') });
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
  const departmentNames = useMemo(() => Object.fromEntries(departments.map(department => [department.id, department.name])), [departments]);

  const updateStage = (key: string, update: (stage: OrderLifecycleDefinition['stages'][number]) => OrderLifecycleDefinition['stages'][number]) => {
    setDefinition(current => ({ ...current, stages: current.stages.map(stage => stage.key === key ? update(stage) : stage) }));
  };
  const addStage = () => {
    let index = definition.stages.length + 1;
    while (definition.stages.some(stage => stage.key === `STAGE-${String(index).padStart(2, '0')}`)) index++;
    const key = `STAGE-${String(index).padStart(2, '0')}`;
    const departmentId = '';
    setDialogBaseline(definition);
    setStageSection('general');
    setDefinition(current => ({ ...current, stages: [...current.stages, {
      key, name: 'New lifecycle stage', action: 'REVIEW_EVIDENCE', departmentId,
      assignment: { kind: 'DEPARTMENT_QUEUE', departmentId, eligibleRoleCodes: [] },
      schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 },
      predecessors: current.stages.length ? [current.stages[current.stages.length - 1].key] : [], forms: [],
    }] }));
    setSelectedStageKey(key);
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
  const openStageSettings = (stageKey: string) => {
    setDialogBaseline(definition);
    setStageSection('general');
    setSelectedStageKey(stageKey);
  };
  const activeStageKey = selectedStageKey;
  const closeStageDialog = () => {
    if (dialogBaseline) setDefinition(dialogBaseline);
    setSelectedStageKey(null);
    setDialogBaseline(null);
  };
  const applyStageDialog = () => {
    setSelectedStageKey(null);
    setDialogBaseline(null);
  };
  const removeStage = (stageKey: string) => {
    setDefinition(current => ({ ...current, stages: current.stages.filter(item => item.key !== stageKey).map(item => ({ ...item, predecessors: item.predecessors.filter(key => key !== stageKey) })) }));
    setSelectedStageKey(null);
    setDialogBaseline(null);
  };

  return <div className="page-stack">
    <header className="page-header"><div><h1>{template.name}</h1><p className="muted">Order lifecycle · {template.orderType?.name ?? 'Order type'} · version {version.versionNumber}</p></div><Badge variant={version.status === 'PUBLISHED' ? 'success' : 'default'}>{version.status}</Badge></header>
    <section className="form-section page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2>Cross-department stages</h2><p className="field-help">Define the owner queue, handoff, schedule policy and published forms for each stage.</p></div>
        <div className="flex flex-wrap gap-2">
          {versionActions.canEdit && <>
            <Button onClick={addStage} disabled={!departments.length || roles.isPending}>Add stage</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate({ expectedVersion: version.version, definition })} disabled={saveMutation.isPending || !validation.isValid}>{saveMutation.isPending ? 'Saving…' : 'Save draft'}</Button>
            {versionActions.canSubmitReview && <Button variant="soft" onClick={() => runAction('submit_review')} disabled={actionMutation.isPending || !validation.isValid}>Submit for review</Button>}
            {versionActions.canPublish && <Button variant="soft" onClick={() => runAction('publish')} disabled={actionMutation.isPending || !validation.isValid}>Publish</Button>}
          </>}
          {!versionActions.canEdit && versionActions.canPublish && <Button variant="primary" onClick={() => runAction('publish')} disabled={actionMutation.isPending || !validation.isValid}>{actionMutation.isPending ? 'Publishing…' : 'Approve & publish'}</Button>}
          {versionActions.canFork && <Button onClick={() => runAction('fork')}>Fork new version</Button>}
          {versionActions.canRetire && <Button variant="ghost" onClick={() => runAction('retire')}>Retire</Button>}
        </div>
      </div>
      {!validation.isValid && <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm"><strong>Fix these before publish</strong><ul className="mt-2 list-disc pl-5">{validation.errors.map((error, index) => <li key={`${error.code}-${index}`}>{error.stageKey ? `${error.stageKey}${error.fieldKey ? ` › ${error.fieldKey}` : ''}: ` : ''}{error.message}</li>)}</ul></div>}
      <Tabs variant="underline" ariaLabel="Workflow views" activeId={activeView} onChange={setActiveView} items={[
        { id: 'map', label: 'Node view', count: definition.stages.length },
        { id: 'edit', label: 'Edit view' },
      ]} />
      <div role="tabpanel" aria-label="Node view" hidden={activeView !== 'map'}>
        <LifecycleWorkflowMap definition={definition} departmentNames={departmentNames} onSelectStage={openStageSettings} />
      </div>
      <div role="tabpanel" aria-label="Edit view" hidden={activeView !== 'edit'}>
        <div className="page-stack">
          <FormField id="lifecycle-name" label="Workflow name" required><Input value={definition.name} onChange={event => setDefinition(current => ({ ...current, name: event.target.value }))} disabled={readOnly} /></FormField>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line bg-surface-muted px-4 py-3 text-xs font-semibold text-muted sm:grid-cols-[minmax(0,1fr)_180px_80px]">
              <span>Stage</span><span className="hidden sm:block">Department</span><span className="text-right">Action</span>
            </div>
            {definition.stages.map((stage, index) => <div key={stage.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px_80px]">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-semibold text-muted">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><strong className="block text-sm text-ink">{stage.name || 'Untitled stage'}</strong><span className="block text-xs text-muted">{actionLabels[stage.action]}</span></div></div>
              <span className="hidden text-sm text-muted sm:block">{departmentNames[stage.departmentId] ?? 'Not assigned'}</span>
              <Button size="small" variant="text" onClick={() => openStageSettings(stage.key)}>{readOnly ? 'View' : 'Edit'}</Button>
            </div>)}
            {definition.stages.length === 0 && <p className="p-6 text-sm text-muted">No stages yet. Add a stage to build this workflow.</p>}
          </div>
        </div>
      </div>
      <Dialog isOpen={selectedStageKey !== null} onClose={closeStageDialog} title={dialogBaseline?.stages.some(stage => stage.key === selectedStageKey) ? (readOnly ? 'Stage details' : 'Edit stage') : 'Add stage'} subtitle="Set ownership, routing and evidence for this stage." size="lg" footer={<>
        {!readOnly && <span className="mr-auto text-xs text-muted">Apply here, then save the workflow draft.</span>}
        <Button onClick={closeStageDialog}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && <Button variant="primary" onClick={applyStageDialog} disabled={validation.errors.some(error => error.stageKey === selectedStageKey)}>Apply changes</Button>}
      </>}>
      {definition.stages.filter(stage => stage.key === activeStageKey).map(stage => {
        const index = definition.stages.findIndex(candidate => candidate.key === stage.key);
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
        const formBranch = stage.activationCondition?.kind === 'FORM_ANSWER' ? stage.activationCondition : undefined;
        const branchPreview = stage.activationCondition?.kind === 'QC_OUTCOME'
          ? `QC outcome is ${Array.isArray(stage.activationCondition.value) ? stage.activationCondition.value.join(', ') : stage.activationCondition.value}`
          : formBranch
            ? `${branchSourceForms(stage).find(option => option.source.key === formBranch.sourceStageKey && option.pin.formVersionId === formBranch.formVersionId)?.fields.find(field => field.key === formBranch.fieldKey)?.label ?? formBranch.fieldKey} ${formBranch.operator === 'EQUALS' ? 'is' : formBranch.operator === 'NOT_EQUALS' ? 'is not' : 'is one of'} “${Array.isArray(formBranch.value) ? formBranch.value.join(', ') : formBranch.value}”`
            : null;
        return <article id={`lifecycle-stage-${stage.key}`} key={stage.key} className="page-stack">
          <div className="flex items-start justify-between gap-4"><div><p className="small muted">Stage {String(index + 1).padStart(2, '0')} · {stage.key}</p><h3 className="mt-1 text-lg font-semibold text-ink">{stage.name}</h3></div>{!readOnly && <Button variant="ghost" onClick={() => removeStage(stage.key)}>Remove stage</Button>}</div>
          <Tabs variant="underline" activeId={stageSection} onChange={setStageSection} ariaLabel="Stage configuration" items={[
            { id: 'general', label: 'General' }, { id: 'routing', label: 'Routing' }, { id: 'forms', label: 'Forms', count: stage.forms.length },
          ]} />
          <div hidden={stageSection !== 'general'}>
          <div className="form-grid">
            <FormField id={`${stage.key}-name`} label="Stage name" required><Input value={stage.name} onChange={event => updateStage(stage.key, current => ({ ...current, name: event.target.value }))} disabled={readOnly} /></FormField>
            <FormField id={`${stage.key}-action`} label="Stage action" required><Select value={stage.action} onChange={event => updateAction(stage.key, event.target.value as LifecycleAction)} disabled={readOnly}>{LIFECYCLE_ACTIONS.map(action => <option key={action} value={action}>{actionLabels[action]}</option>)}</Select></FormField>
            <FormField id={`${stage.key}-department`} label="Owning department" required><Select value={stage.departmentId} onChange={event => updateStage(stage.key, current => ({ ...current, departmentId: event.target.value, assignment: { kind: 'DEPARTMENT_QUEUE', departmentId: event.target.value, eligibleRoleCodes: current.assignment.kind === 'DEPARTMENT_QUEUE' ? current.assignment.eligibleRoleCodes : [] } }))} disabled={readOnly}><option value="">Choose department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></FormField>
            <div className="page-stack"><FormField id={`${stage.key}-assignment-kind`} label="Assignment" required><Select value={stage.assignment.kind} onChange={event => updateStage(stage.key, current => ({ ...current, assignment: event.target.value === 'MEMBER' ? { kind: 'MEMBER', membershipId: '', departmentId: current.departmentId } : { kind: 'DEPARTMENT_QUEUE', departmentId: current.departmentId, eligibleRoleCodes: [] } }))} disabled={readOnly}><option value="DEPARTMENT_QUEUE">Eligible department queue</option><option value="MEMBER">Specific person</option></Select></FormField>
              {stage.assignment.kind === 'MEMBER' ? <FormField id={`${stage.key}-member`} label="Assigned person" required><div><Select value={stage.assignment.membershipId} onChange={event => updateStage(stage.key, current => current.assignment.kind === 'MEMBER' ? { ...current, assignment: { ...current.assignment, membershipId: event.target.value } } : current)} disabled={readOnly || members.isPending}><option value="">Choose active department member</option>{(members.data?.get(stage.departmentId) ?? []).map(member => <option key={member.membershipId} value={member.membershipId}>{member.name}{member.roles.length ? ` · ${member.roles.map(role => role.name).join(', ')}` : ''}</option>)}</Select>{members.error && <p role="alert" className="text-xs text-danger">Department members could not be loaded.</p>}</div></FormField>
                : <fieldset><legend className="form-label">Eligible role queue</legend><div className="grid gap-2 sm:grid-cols-2">{(roles.data?.data ?? []).filter(role => role.isActive).map(role => <label key={role.code} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stage.assignment.kind === 'DEPARTMENT_QUEUE' && stage.assignment.eligibleRoleCodes.includes(role.code)} onChange={() => toggleRole(stage.key, role.code)} disabled={readOnly} />{role.name}</label>)}</div></fieldset>}</div>
          </div>
          </div>
          <div hidden={stageSection !== 'routing'} className="space-y-5">
          <div className="form-grid">
            <div className="page-stack"><FormField id={`${stage.key}-schedule`} label="Scheduling policy"><Select value={stage.schedule.kind} onChange={event => updateStage(stage.key, current => ({ ...current, schedule: event.target.value === 'RESOURCE_CAPACITY' ? { kind: 'RESOURCE_CAPACITY', routingSource: 'APPROVED_ENGINEERING' } : { kind: 'DEADLINE', dueAfterMinutes: 480 } }))} disabled={readOnly || stage.action === 'PLAN_PRODUCTION' || stage.action === 'EXECUTE_PRODUCTION'}><option value="DEADLINE">Owner deadline</option><option value="RESOURCE_CAPACITY">Production capacity from approved routing</option></Select></FormField>{stage.schedule.kind === 'DEADLINE' && <FormField id={`${stage.key}-deadline`} label="Deadline (minutes)"><Input type="number" min={1} value={stage.schedule.dueAfterMinutes} onChange={event => updateStage(stage.key, current => ({ ...current, schedule: { kind: 'DEADLINE', dueAfterMinutes: Number(event.target.value) } }))} disabled={readOnly} /></FormField>}</div>
            <fieldset><legend className="form-label">Starts after</legend><div className="grid gap-2 sm:grid-cols-2">{definition.stages.filter(candidate => candidate.key !== stage.key).map(candidate => <label key={candidate.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={stage.predecessors.includes(candidate.key)} onChange={event => updateStage(stage.key, current => ({ ...current, predecessors: event.target.checked ? [...current.predecessors, candidate.key] : current.predecessors.filter(key => key !== candidate.key) }))} disabled={readOnly} />{candidate.name}</label>)}</div></fieldset>
          </div>
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="form-label px-1">Branch routing</legend>
            <p className="field-help">Route from a submitted order-form answer or a finalized QC outcome. A non-matching branch is skipped.</p>
            <FormField id={`${stage.key}-branch-mode`} label="When this stage becomes eligible">
              <Select value={!stage.activationCondition ? 'always' : stage.activationCondition.kind === 'QC_OUTCOME' ? 'qc' : 'form'} onChange={event => {
                if (event.target.value === 'always') updateBranchCondition(stage.key, undefined);
                else if (event.target.value === 'qc') {
                  const source = stage.predecessors.map(key => definition.stages.find(candidate => candidate.key === key)).find(candidate => candidate?.action === 'FINALIZE_QC');
                  if (source) updateBranchCondition(stage.key, { kind: 'QC_OUTCOME', sourceStageKey: source.key, operator: 'EQUALS', value: 'PASSED' });
                } else if (!stage.activationCondition || stage.activationCondition.kind === 'QC_OUTCOME') {
                  const first = branchSourceForms(stage)[0];
                  if (first?.fields[0]) updateBranchCondition(stage.key, {
                    kind: 'FORM_ANSWER', sourceStageKey: first.source.key, formVersionId: first.pin.formVersionId,
                    fieldKey: first.fields[0].key, operator: 'EQUALS', value: first.fields[0].options?.[0]?.value ?? '',
                  });
                }
              }} disabled={readOnly}>
                <option value="always">Always, after predecessors finish</option>
                <option value="form" disabled={!branchSourceForms(stage).some(option => option.fields.length)}>Only when a form answer matches</option>
                <option value="qc" disabled={!stage.predecessors.some(key => definition.stages.find(candidate => candidate.key === key)?.action === 'FINALIZE_QC')}>Only for a QC outcome</option>
              </Select>
            </FormField>
            {stage.activationCondition?.kind === 'QC_OUTCOME' && <div className="form-grid mt-3">
              <FormField id={`${stage.key}-qc-source`} label="QC predecessor" required><Select value={stage.activationCondition.sourceStageKey} onChange={event => updateBranchCondition(stage.key, { ...stage.activationCondition!, sourceStageKey: event.target.value })} disabled={readOnly}>{stage.predecessors.map(key => definition.stages.find(candidate => candidate.key === key)).filter((candidate): candidate is NonNullable<typeof candidate> => candidate?.action === 'FINALIZE_QC').map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.name}</option>)}</Select></FormField>
              <FormField id={`${stage.key}-qc-outcome`} label="Final QC outcome" required><Select value={String(stage.activationCondition.value)} onChange={event => updateBranchCondition(stage.key, { ...stage.activationCondition!, value: event.target.value as typeof QC_LIFECYCLE_OUTCOMES[number] })} disabled={readOnly}>{QC_LIFECYCLE_OUTCOMES.map(outcome => <option key={outcome} value={outcome}>{outcome.replaceAll('_', ' ').toLowerCase()}</option>)}</Select></FormField>
            </div>}
            {formBranch && <div className="form-grid mt-3">
              <FormField id={`${stage.key}-branch-source`} label="Predecessor form" required>
                <Select value={`${formBranch.sourceStageKey}|${formBranch.formVersionId}`} onChange={event => {
                  const selected = branchSourceForms(stage).find(option => `${option.source.key}|${option.pin.formVersionId}` === event.target.value);
                  if (selected?.fields[0]) updateBranchCondition(stage.key, {
                    ...formBranch, sourceStageKey: selected.source.key, formVersionId: selected.pin.formVersionId,
                    fieldKey: selected.fields[0].key, value: selected.fields[0].options?.[0]?.value ?? '',
                  });
                }} disabled={readOnly || formDefinitions.isPending}>
                  {branchSourceForms(stage).map(option => <option key={`${option.source.key}|${option.pin.formVersionId}`} value={`${option.source.key}|${option.pin.formVersionId}`}>{option.source.name} · {forms.data?.data.find(form => form.publishedVersion?.id === option.pin.formVersionId)?.name}</option>)}
                </Select>
              </FormField>
              {(() => {
                const selected = branchSourceForms(stage).find(option => option.source.key === formBranch.sourceStageKey && option.pin.formVersionId === formBranch.formVersionId);
                const fields = selected?.fields ?? [];
                const field = fields.find(option => option.key === formBranch.fieldKey) ?? fields[0];
                const values = field?.options ?? [];
                return <>
                  <FormField id={`${stage.key}-branch-field`} label="Form question" required>
                    <Select value={formBranch.fieldKey} onChange={event => {
                      const nextField = fields.find(option => option.key === event.target.value);
                      updateBranchCondition(stage.key, { ...formBranch, fieldKey: event.target.value, value: nextField?.options?.[0]?.value ?? '' });
                    }} disabled={readOnly || !fields.length}>
                      {fields.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </Select>
                  </FormField>
                  <FormField id={`${stage.key}-branch-operator`} label="Answer rule" required>
                    <Select value={formBranch.operator} onChange={event => updateBranchCondition(stage.key, { ...formBranch, operator: event.target.value as FormAnswerBranchCondition['operator'], value: event.target.value === 'IN' ? [values[0]?.value ?? ''] : values[0]?.value ?? '' })} disabled={readOnly}>
                      <option value="EQUALS">is</option><option value="NOT_EQUALS">is not</option><option value="IN">is one of</option>
                    </Select>
                  </FormField>
                  <FormField id={`${stage.key}-branch-value`} label="Answer value" required>
                    {formBranch.operator === 'IN' ? <div className="grid gap-2 rounded-lg border border-line p-3">
                      {values.map(option => <label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(formBranch.value) && formBranch.value.includes(option.value)} onChange={event => {
                        const currentValues = Array.isArray(formBranch.value) ? formBranch.value : [];
                        const nextValues = event.target.checked ? [...currentValues, option.value] : currentValues.filter(value => value !== option.value);
                        updateBranchCondition(stage.key, { ...formBranch, value: nextValues });
                      }} disabled={readOnly} />{option.label}</label>)}
                    </div> : <Select value={String(formBranch.value)} onChange={event => updateBranchCondition(stage.key, { ...formBranch, value: event.target.value })} disabled={readOnly || !values.length}>
                      {values.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>}
                  </FormField>
                </>;
              })()}
            </div>}
          </fieldset>
          </div>
          <div hidden={stageSection !== 'forms'}>
          <fieldset className="min-w-0"><legend className="form-label">Stage forms</legend><p className="field-help mb-4">Choose the evidence to collect and when it must be completed.</p><div className="grid min-w-0 gap-4">{visibleForms.map(form => {
            const formVersion = form.publishedVersion!;
            const pin = stage.forms.find(candidate => candidate.formVersionId === formVersion.id);
            const compatible = compatibleFormIds.has(formVersion.id);
            return <div key={formVersion.id} className="min-w-0 overflow-hidden rounded-xl border border-line text-sm">
              <label className="flex cursor-pointer items-start gap-3 p-4"><input className="mt-1 shrink-0" type="checkbox" checked={Boolean(pin)} onChange={() => toggleForm(stage.key, form)} disabled={readOnly || (!compatible && !pin)} /><span className="min-w-0"><strong className="block text-sm font-semibold text-ink">{form.name}</strong><span className="mt-1 block break-words text-xs text-muted">{form.code} · Version {formVersion.versionNumber}</span>{!compatible && <span className="block text-warning">Purpose is incompatible with this action. Remove this pin or change the action.</span>}</span></label>
              {pin && <details className="mx-4 mb-4 border-t border-line pt-3" aria-label={`${form.name} field preview`}>
                <summary className="cursor-pointer text-xs font-semibold text-muted">Preview form fields{formDefinitions.data?.get(formVersion.id)?.fields.length ? ` (${formDefinitions.data.get(formVersion.id)!.fields.length})` : ''}</summary>
                {formDefinitions.isPending ? <p className="mt-3 text-xs text-muted">Loading fields…</p> : formDefinitions.data?.get(formVersion.id)?.fields.length ? <ul className="mt-3 divide-y divide-line">
                  {formDefinitions.data.get(formVersion.id)!.fields.map(field => <li key={field.key} className="flex items-center justify-between gap-4 py-2 text-xs"><span className="text-ink">{field.label}</span><span className="shrink-0 text-muted">{field.kind === 'textarea' ? 'Long text' : field.kind === 'select' ? 'Choice' : field.kind === 'text' ? 'Text' : field.kind}</span></li>)}
                </ul> : <p className="mt-3 text-xs text-warning">Form fields could not be loaded.</p>}
              </details>}
              {pin && <div className="grid min-w-0 gap-4 border-t border-line bg-surface-muted p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <FormField id={`${stage.key}-${formVersion.id}-required`} label="Requirement"><Select value={pin.required ? 'required' : 'optional'} onChange={event => updateStage(stage.key, current => ({ ...current, forms: current.forms.map(candidate => candidate.formVersionId === formVersion.id ? { ...candidate, required: event.target.value === 'required' } : candidate) }))} disabled={readOnly}><option value="required">Required</option><option value="optional">Optional</option></Select></FormField>
                <FormField id={`${stage.key}-${formVersion.id}-completion`} label="Complete before"><Select value={pin.completionPoint} onChange={event => updateStage(stage.key, current => ({ ...current, forms: current.forms.map(candidate => candidate.formVersionId === formVersion.id ? { ...candidate, completionPoint: event.target.value as 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' } : candidate) }))} disabled={readOnly}><option value="BEFORE_ACTION">Before stage action</option><option value="BEFORE_STAGE_COMPLETION">Before stage completion</option></Select></FormField>
              </div>}
            </div>;
          })}{visibleForms.length === 0 && <p className="field-help">No published compatible form is available for this action.</p>}</div></fieldset>
          </div>
          <details className="rounded-lg border border-line bg-surface-muted p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Execution preview</summary>
            <div className="mt-3">
            <p className="mt-1 text-muted">When ready, <span className="font-medium text-ink">{assignmentPreview}</span> in <span className="font-medium text-ink">{departments.find(department => department.id === stage.departmentId)?.name ?? 'the selected department'}</span> handles “{stage.name}” ({actionLabels[stage.action]}).</p>
            <p className="mt-1 text-muted">Evidence: {formPreview.length ? formPreview.join(' · ') : 'no form attached'}.</p>
            {branchPreview && <p className="mt-1 text-muted">Branch rule: {branchPreview}; otherwise this stage is skipped.</p>}
            <p className="mt-1 text-muted">Scheduling: {stage.schedule.kind === 'DEADLINE' ? `owner deadline ${stage.schedule.dueAfterMinutes} minutes after activation` : 'real production capacity through Planning after Engineering approval'}.</p>
            <p className="mt-1 text-muted">Next: {successors.length ? successors.map(successor => successor.name).join(', ') : 'workflow ends after this stage'}{successors.length > 1 ? ' (parallel successors; each also waits for its other predecessors)' : ''}.</p>
            {stage.schedule.kind === 'RESOURCE_CAPACITY' && <p className="mt-1 text-xs text-muted">Preview does not reserve capacity. Planning revalidates resources, skills, shifts, material and bookings.</p>}
            </div>
          </details>
          {!readOnly && validation.errors.some(error => error.stageKey === stage.key) && <div role="status" className="rounded-lg bg-warning-soft p-3 text-sm text-warning"><p className="font-semibold">Complete this stage before applying</p><ul className="mt-2 list-disc space-y-1 pl-4">{validation.errors.filter(error => error.stageKey === stage.key).map((error, index) => <li key={index}>{error.message}</li>)}</ul></div>}
        </article>;
      })}
      </Dialog>
      {(saveMutation.error || actionMutation.error) && <p role="alert" className="text-sm text-danger">{(saveMutation.error || actionMutation.error)?.message}</p>}
      {roles.error && <p role="alert" className="text-sm text-danger">Role list unavailable. Stage ownership cannot be configured.</p>}
      {forms.error && <p role="alert" className="text-sm text-danger">Published forms could not be loaded.</p>}
    </section>
  </div>;
}
