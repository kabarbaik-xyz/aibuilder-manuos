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
          <fieldset><legend className="form-label">Published forms</legend><p className="field-help">A form is pinned to this workflow version. Required forms must be submitted before this stage completes.</p><div className="grid gap-2 sm:grid-cols-2">{compatibleForms.map(form => <label key={form.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input type="checkbox" checked={stage.forms.some(pin => pin.formVersionId === form.publishedVersion?.id)} onChange={() => toggleForm(stage.key, form)} disabled={readOnly} /><span><strong>{form.name}</strong><span className="block muted">{form.code} · v{form.publishedVersion?.versionNumber}</span></span></label>)}{compatibleForms.length === 0 && <p className="field-help">No published compatible form is available for this action.</p>}</div></fieldset>
        </article>;
      })}
      {(saveMutation.error || actionMutation.error) && <p role="alert" className="text-sm text-danger">{(saveMutation.error || actionMutation.error)?.message}</p>}
      {roles.error && <p role="alert" className="text-sm text-danger">Role list unavailable. Stage ownership cannot be configured.</p>}
      {forms.error && <p role="alert" className="text-sm text-danger">Published forms could not be loaded.</p>}
    </section>
  </div>;
}
