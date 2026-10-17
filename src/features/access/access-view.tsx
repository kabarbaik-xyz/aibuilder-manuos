'use client';
import Link from 'next/link';
import { availablePages, getLandingPage, roleLabels } from '@/lib/persona-navigation';
import { getFunctionalNavigation } from '@/lib/master-navigation';
import { usePaginatedList } from '@/lib/api/use-paginated-list';

import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiRequest, ApiError } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/ui/resource-state';

type Section = 'users' | 'roles' | 'permissions';
export interface AccessUser { id: string; userId: string; name: string; email: string; status: 'ACTIVE' | 'DISABLED'; roles: string[]; customerId: string | null; technicianId: string | null; facilityId?: string | null; departmentId?: string | null; jobTitle?: string | null; supervisorMembershipId?: string | null; supervisorName?: string | null; landingPage?: string | null; version: number; identityUpdatedAt: string; canEditIdentity: boolean }
export interface AccessRole { id: string; code: string; name: string; isSystem: boolean; isActive: boolean; permissions: string[]; version: number; memberCount: number }
export interface Permission { code: string; description: string; resource: string; action: string }
interface ScopeOption { id: string; code: string; name: string; membershipId?: string | null }
interface SupervisorOption { id: string; name: string; jobTitle: string | null }
export interface Scopes { customers: ScopeOption[]; technicians: ScopeOption[]; departments: ScopeOption[]; calendars: ScopeOption[]; facilities: ScopeOption[]; supervisors: SupervisorOption[] }
const descriptions = {
  users: 'Add people, assign departments and account access, then connect qualifications, availability and work.',
  roles: 'Define custom access bundles. System role definitions are protected.',
  permissions: 'Browse the application permission catalog and the roles that grant each capability.',
};

export function AccessView({ section, initialTechnicianId }: { section: Section; initialTechnicianId?: string }) {
  const { principal, isPending, error: sessionError } = useWorkspaceNavigation();
  const allowed = Boolean(principal?.permissions.includes('access.manage'));
  const workspaceId = principal?.workspaceId;
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ user?: AccessUser; role?: AccessRole } | null>(null);
  const [notice, setNotice] = useState('');
  const openedInitial = useRef(false);
  const queryKey = ['access', workspaceId];
  const roles = useQuery({ queryKey: [...queryKey, 'roles'], queryFn: () => apiRequest<{ data: AccessRole[] }>('/api/roles'), enabled: allowed });
  const permissions = useQuery({ queryKey: [...queryKey, 'permissions'], queryFn: () => apiRequest<{ data: Permission[] }>('/api/permissions'), enabled: allowed });
  const table = usePaginatedList<AccessUser | AccessRole | Permission>(section, { search }, allowed);
  const scopes = useQuery({ queryKey: [...queryKey, 'scopes'], queryFn: () => apiRequest<{ data: Scopes }>('/api/access/scopes'), enabled: allowed && section === 'users' });
  useEffect(() => {
    if (!initialTechnicianId || openedInitial.current || !scopes.data) return;
    openedInitial.current = true;
    if (scopes.data.data.technicians.some(t => t.id === initialTechnicianId && !t.membershipId)) setEditor({});
    else setNotice('This technician is unavailable or already linked. Choose a person to review the account link.');
  }, [initialTechnicianId, scopes.data]);
  if (isPending) return <LoadingState />;
  if (!allowed) return <ErrorState message={sessionError?.message || 'You need access.manage to administer workspace access.'} />;
  const error = roles.error || permissions.error || table.error || scopes.error;
  const loading = roles.isPending || permissions.isPending || table.isPending || (section === 'users' && scopes.isPending);
  const roleData = roles.data?.data || [];
  const permissionData = permissions.data?.data || [];
  const userData = (table.data?.data || []) as AccessUser[];
  const userColumns: Column<AccessUser>[] = [
    { key: 'name', header: 'User', render: user => <div><Link className="text-primary hover:underline" href={`/settings/users/${user.id}`}>{user.name}</Link><p className="muted">{user.email}</p></div> },
    { key: 'roles', header: 'Roles', render: user => <div className="access-badges">{user.roles.map(code => <Badge key={code}>{roleLabels[code] || roleData.find(role => role.code === code)?.name || code}</Badge>)}</div> },
    { key: 'department', header: 'Organization', render: user => <div><strong>{user.jobTitle || 'Position not set'}</strong><p className="muted">{scopes.data?.data.departments.find(d => d.id === user.departmentId)?.name || (user.departmentId ? 'Department outside active options' : 'No department')} · Supervisor: {user.supervisorName || 'Not assigned'}</p></div> },
    { key: 'status', header: 'Status', render: user => <Badge variant={user.status === 'ACTIVE' ? 'success' : 'default'}>{user.status}</Badge> },
    { key: 'scope', header: 'Scope', render: user => user.customerId ? `Customer: ${scopes.data?.data.customers.find(c => c.id === user.customerId)?.name || 'Linked customer'}` : user.technicianId ? `Technician: ${scopes.data?.data.technicians.find(t => t.id === user.technicianId)?.name || 'Linked technician'}` : 'Workspace' },
    { key: 'actions', header: 'Actions', render: user => <Button size="small" onClick={() => setEditor({ user })} aria-label={`Edit ${user.name}`}>Edit user</Button> },
  ];
  const roleColumns: Column<AccessRole>[] = [
    { key: 'name', header: 'Role', render: role => <div><strong>{role.name}</strong><p className="muted">{role.code}</p></div> },
    { key: 'type', header: 'Type', render: role => <Badge variant={role.isSystem ? 'blue' : 'default'}>{role.isSystem ? 'System' : 'Custom'}</Badge> },
    { key: 'permissions', header: 'Permissions', render: role => role.permissions.length },
    { key: 'members', header: 'Memberships', render: role => role.memberCount },
    { key: 'status', header: 'Status', render: role => <Badge variant={role.isActive ? 'success' : 'default'}>{role.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: 'Actions', render: role => <Button size="small" onClick={() => setEditor({ role })} aria-label={`${role.isSystem ? 'View' : 'Edit'} ${role.name}`}>{role.isSystem ? 'View grants' : 'Edit role'}</Button> },
  ];
  const permissionColumns: Column<Permission & { id: string }>[] = [
    { key: 'code', header: 'Permission', render: permission => <div><strong>{permission.code}</strong><p className="muted">{permission.description}</p></div> },
    { key: 'resource', header: 'Resource' }, { key: 'action', header: 'Action' },
    { key: 'grants', header: 'Granted by active roles', render: permission => <div className="access-badges">{roleData.filter(role => role.isActive && role.permissions.includes(permission.code)).map(role => <Badge key={role.id}>{role.name}</Badge>)}</div> },
  ];
  return <div className="page-stack">
    <PageHeader title={section === 'users' ? 'People & Access' : section[0].toUpperCase() + section.slice(1)} description={descriptions[section]} actions={section !== 'permissions' && <Button variant="primary" icon="plus" onClick={() => setEditor({})} disabled={loading || Boolean(error)}>{section === 'users' ? 'Add person' : 'New role'}</Button>} />
    {notice && <p className="field-help" role="status">{notice}</p>}
    <div className="access-search"><label className="sr-only" htmlFor="access-search">Search {section}</label><Input id="access-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={`Search ${section}…`} /></div>
    {error ? <ErrorState message={error.message} onRetry={() => { void roles.refetch(); void permissions.refetch(); void table.refetch(); if (section === 'users') { void scopes.refetch(); } }} /> : loading ? <LoadingState /> : section === 'users' ? <DataTable columns={userColumns} pagination={table.pagination} data={userData} emptyTitle="No users found" emptyDescription="Try a different search or create a workspace user." /> : section === 'roles' ? <DataTable columns={roleColumns} pagination={table.pagination} data={(table.data?.data || []) as AccessRole[]} emptyTitle="No roles found" /> : <DataTable columns={permissionColumns} pagination={table.pagination} data={((table.data?.data || []) as Permission[]).map(p => ({ ...p, id: p.code }))} emptyTitle="No permissions found" />}
    {section === 'permissions' && <p className="field-help">Permissions are defined by application capabilities. Assign them through custom roles; creating arbitrary permission names would not add application behavior.</p>}
    {editor && <AccessEditor initialTechnicianId={initialTechnicianId} section={section} user={editor.user} role={editor.role} roles={roleData} permissions={permissionData} scopes={scopes.data?.data || { customers: [], technicians: [], departments: [], calendars: [], facilities: [], supervisors: [] }} workspaceId={workspaceId!} onClose={() => setEditor(null)} onSaved={message => { setEditor(null); setNotice(message); }} />}
  </div>;
}

export function AccessEditor({ section, user, role, roles, permissions, scopes, workspaceId, onClose, onSaved, initialTechnicianId }: {
  initialTechnicianId?: string; section: Section; user?: AccessUser; role?: AccessRole; roles: AccessRole[]; permissions: Permission[]; scopes: Scopes; workspaceId: string;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const prefix = useId();
  const client = useQueryClient();
  const router = useRouter();
  const isUser = section === 'users';
  const readOnly = Boolean(role?.isSystem);
  const initial = { name: user?.name || role?.name || scopes.technicians.find(t => t.id === initialTechnicianId)?.name || '', email: user?.email || '', password: '', code: role?.code || '',
    roleCodes: user?.roles || (initialTechnicianId ? ['TECHNICIAN'] : []), permissions: role?.permissions || [], status: user?.status || 'ACTIVE',
    isActive: role?.isActive ?? true, customerId: user?.customerId || '', technicianId: user?.technicianId || initialTechnicianId || '', departmentId: user?.departmentId || '', jobTitle: user?.jobTitle || '', supervisorMembershipId: user?.supervisorMembershipId || '', facilityId: user?.facilityId || '', landingPage: user?.landingPage || '', technicianCode: '', calendarId: '' };
  const [form, setForm] = useState(initial);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const mutation = useMutation({ mutationFn: async () => {
    const url = isUser ? `/api/users${user ? `/${user.id}` : ''}` : `/api/roles${role ? `/${role.id}` : ''}`;
    const body = isUser ? { ...(user ? { expectedVersion: user.version, status: form.status, ...(user.canEditIdentity ? { name: form.name, email: form.email, expectedIdentityUpdatedAt: user.identityUpdatedAt } : {}) } : { name: form.name, email: form.email, password: form.password }), facilityId: form.facilityId || undefined, departmentId: form.departmentId || null, jobTitle: form.jobTitle || null, supervisorMembershipId: form.supervisorMembershipId || null, landingPage: form.landingPage || null, ...(form.technicianId === '__new' ? { newTechnician: { code: form.technicianCode, calendarId: form.calendarId || null } } : {}), roleCodes: form.roleCodes, customerId: form.customerId || null, technicianId: form.technicianId === '__new' ? null : form.technicianId || null }
      : { name: form.name, permissions: form.permissions, ...(role ? { expectedVersion: role.version, isActive: form.isActive } : { code: form.code }) };
    const serialized = JSON.stringify(body);
    if (!attempt.current || attempt.current.body !== serialized) attempt.current = { body: serialized, key: crypto.randomUUID() };
    return apiRequest<{ data: { reauthenticate?: boolean; membershipId?: string } }>(url, { method: user || role ? 'PATCH' : 'POST', body: serialized, headers: { 'idempotency-key': attempt.current.key } });
  } });
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (mutation.isPending || readOnly) return; setError(null);
    try {
      const result = await mutation.mutateAsync();
      if (result.data.reauthenticate) {
        client.clear();
        onClose();
        router.replace('/login');
        router.refresh();
        return;
      }
      // Grants affect navigation and every authorized read, not just the table being edited.
      client.removeQueries({ predicate: query => query.queryKey[0] !== 'access' && query.queryKey[0] !== 'me' });
      await Promise.all([client.invalidateQueries({ queryKey: ['access', workspaceId] }), client.invalidateQueries({ queryKey: ['me'] })]);
      router.refresh();
      onSaved(isUser ? 'User details and workspace access saved.' : 'Role grants saved. They apply to subsequent requests.');
      if (isUser && !user && result.data.membershipId) router.push(`/settings/users/${result.data.membershipId}`);
    } catch (err) { setError(err as ApiError); }
  }
  function toggle(key: 'roleCodes' | 'permissions', value: string) { setForm(current => ({ ...current, landingPage: '', ...(key === 'roleCodes' && value === 'TECHNICIAN' ? { technicianId: current.roleCodes.includes(value) ? current.technicianId === '__new' ? '' : current.technicianId : current.technicianId || '__new' } : {}), [key]: current[key].includes(value) ? current[key].filter(code => code !== value) : [...current[key], value] })); }
  const visiblePermissions = permissions.filter(p => `${p.code} ${p.description}`.toLowerCase().includes(permissionSearch.toLowerCase()));
  const resources = [...new Set(visiblePermissions.map(p => p.resource))];
  const selectedRoles = isUser ? roles.filter(r => r.isActive && form.roleCodes.includes(r.code)) : form.isActive ? [{ code: form.code, permissions: form.permissions }] : [];
  const previewPermissions = [...new Set(selectedRoles.flatMap(r => r.permissions))];
  const previewRoles = selectedRoles.map(r => r.code);
  const previewGroups = getFunctionalNavigation(previewPermissions, previewRoles, form.customerId || null);
  const previewPages = availablePages(previewPermissions, previewRoles, form.customerId || null);
  const landing = getLandingPage(previewPermissions, previewRoles, form.customerId || null, form.landingPage);
  const title = isUser ? user ? 'Edit user' : 'New user' : role ? readOnly ? 'System role grants' : 'Edit role' : 'New role';
  return <Dialog isOpen onClose={onClose} title={title} subtitle={isUser ? 'Membership and grants apply to this workspace.' : 'Permissions are checked by the server for every operation.'} size="lg" type="modal" pending={mutation.isPending} dirty={!readOnly && JSON.stringify(form) !== JSON.stringify(initial)} footer={<><Button data-dialog-dismiss disabled={mutation.isPending}>{readOnly ? 'Close' : 'Cancel'}</Button>{!readOnly && <Button type="submit" form={`${prefix}-form`} variant="primary" disabled={mutation.isPending || (isUser ? !form.roleCodes.length : !form.permissions.length)}>{mutation.isPending ? 'Saving…' : isUser && user && form.status === 'DISABLED' ? 'Disable membership' : isUser ? 'Save user' : 'Save role'}</Button>}</>}>
    <form id={`${prefix}-form`} onSubmit={submit} className="page-stack">
      <FormErrorSummary error={error} />
      <fieldset disabled={mutation.isPending || readOnly} className="access-fieldset page-stack">
        {isUser ? <>
          <div className="form-grid"><FormField id={`${prefix}-name`} label="Name" required><Input value={form.name} readOnly={Boolean(user && !user.canEditIdentity)} maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} /></FormField><FormField id={`${prefix}-email`} label="Email" required><Input type="email" value={form.email} readOnly={Boolean(user && !user.canEditIdentity)} autoComplete="off" onChange={event => setForm({ ...form, email: event.target.value })} /></FormField></div>
          {user && <p className="field-help">{user.canEditIdentity ? 'Changing the email signs this user out of all sessions. Their password stays the same.' : 'This account belongs to multiple workspaces. Editing its name or email requires access administration in every linked workspace. Roles, scope and membership status can still be managed here.'}</p>}
          {!user && <FormField id={`${prefix}-password`} label="Initial password" required help="Use at least 12 characters. Share credentials through your approved channel."><Input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></FormField>}
          <FormField id={`${prefix}-department`} label="Department" help="Organization only. Access is controlled separately by roles, facility/customer scope and assigned tasks."><Select value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}><option value="">No department assigned</option>{scopes.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></FormField>
          <div className="form-grid"><FormField id={`${prefix}-job-title`} label="Job title"><Input value={form.jobTitle} maxLength={120} onChange={event => setForm({ ...form, jobTitle: event.target.value })} placeholder="e.g. Production Supervisor" /></FormField><FormField id={`${prefix}-supervisor`} label="Direct supervisor" help="Approval requests are routed to this active workspace member."><Select value={form.supervisorMembershipId} onChange={event => setForm({ ...form, supervisorMembershipId: event.target.value })}><option value="">No supervisor assigned</option>{scopes.supervisors.filter(option => option.id !== user?.id).map(option => <option key={option.id} value={option.id}>{option.name}{option.jobTitle ? ` · ${option.jobTitle}` : ''}</option>)}</Select></FormField></div>
          <FormField id={`${prefix}-facility`} label="Primary facility scope" help="Choose only from your granted facilities. Existing additional facility grants remain separate; department selection does not grant access."><Select value={form.facilityId} onChange={event => setForm({ ...form, facilityId: event.target.value })}><option value="">Use current / administrator’s primary facility</option>{scopes.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></FormField>
          <fieldset className="access-fieldset"><legend className="access-legend">Roles *</legend><div className="access-choice-grid">{roles.filter(r => r.isActive || form.roleCodes.includes(r.code)).map(r => <label className="access-choice" key={r.id}><input type="checkbox" checked={form.roleCodes.includes(r.code)} onChange={() => toggle('roleCodes', r.code)} /><span><strong>{roleLabels[r.code] || r.name}</strong><small>{r.code}{!r.isActive ? ' · Inactive' : ''}</small></span></label>)}</div><p className="field-help">Permissions from active roles are combined. Customer-scoped memberships use the Customer role only.</p></fieldset>
          <div className="form-grid"><FormField id={`${prefix}-customer`} label="Customer scope" help="Required for the Customer role."><Select value={form.customerId} onChange={event => setForm({ ...form, customerId: event.target.value, technicianId: '' })}><option value="">No customer scope</option>{scopes.customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</Select></FormField><FormField id={`${prefix}-technician`} label="Technician link" help="Required for the Technician role."><Select value={form.technicianId} onChange={event => setForm({ ...form, technicianId: event.target.value, customerId: '' })}><option value="">Select technician profile</option>{form.roleCodes.includes('TECHNICIAN') && <option value="__new">Create profile with this account</option>}{user?.technicianId && !scopes.technicians.some(t => t.id === user.technicianId) && <option value={user.technicianId}>Current linked technician</option>}{scopes.technicians.filter(t => !t.membershipId || t.id === user?.technicianId).map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select></FormField></div>
          {form.technicianId === '__new' && <div className="form-grid"><FormField id={`${prefix}-tech-code`} label="Technician code" required help="Unique employee/operator code. The profile uses this person’s name and department."><Input required value={form.technicianCode} maxLength={50} onChange={event => setForm({ ...form, technicianCode: event.target.value })} /></FormField><FormField id={`${prefix}-calendar`} label="Working calendar"><Select value={form.calendarId} onChange={event => setForm({ ...form, calendarId: event.target.value })}><option value="">Configure later</option>{scopes.calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField></div>}
          <FormField id={`${prefix}-landing`} label="Starting page after login" help="Automatic uses the person’s operational role. For multiple roles, choose a preferred page. All people sign in at /login."><Select value={form.landingPage} onChange={event => setForm({ ...form, landingPage: event.target.value })}><option value="">Automatic ({previewPages.find(p => p.href === landing)?.title || 'Account'})</option>{previewPages.map(page => <option key={page.href} value={page.href}>{page.title}</option>)}</Select></FormField>
          {user && <FormField id={`${prefix}-status`} label="Membership status" help="Disabling blocks this workspace on the next request. At least one active Access Admin must remain."><Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value === 'DISABLED' ? 'DISABLED' : 'ACTIVE' })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></Select></FormField>}
        </> : <>
          <div className="form-grid"><FormField id={`${prefix}-code`} label="Role code" required help="Uppercase letters, digits and underscores; cannot change after creation."><Input value={form.code} readOnly={Boolean(role)} pattern="[A-Z][A-Z0-9_]{1,49}" maxLength={50} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. QC_REVIEWER" /></FormField><FormField id={`${prefix}-name`} label="Role name" required><Input value={form.name} maxLength={100} onChange={event => setForm({ ...form, name: event.target.value })} /></FormField></div>
          {readOnly && <p className="field-help">This system bundle is protected. Create a custom role to define a different set of grants.</p>}
          {role && !readOnly && <FormField id={`${prefix}-active`} label="Role status" help="Inactive roles grant no permissions to assigned users."><Select value={form.isActive ? 'ACTIVE' : 'INACTIVE'} onChange={event => setForm({ ...form, isActive: event.target.value === 'ACTIVE' })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>}
        </>}
      </fieldset>
      {!isUser && <div className="page-stack"><label className="form-field">Filter permissions<Input type="search" value={permissionSearch} onChange={event => setPermissionSearch(event.target.value)} placeholder="Search capability or description…" /></label><p className="field-help" aria-live="polite">{form.permissions.length} permissions selected</p>{resources.map(resource => <fieldset className="access-permission-group" disabled={readOnly || mutation.isPending} key={resource}><legend className="access-legend">{resource}</legend><div className="access-choice-grid">{visiblePermissions.filter(p => p.resource === resource).map(p => <label className="access-choice" key={p.code}><input type="checkbox" checked={form.permissions.includes(p.code)} onChange={() => toggle('permissions', p.code)} /><span><strong>{p.code}</strong><small>{p.description}</small></span></label>)}</div></fieldset>)}{!visiblePermissions.length && <p className="field-help">No matching permissions.</p>}</div>}
      <section className="rounded-xl border border-line bg-surface-muted p-4"><h3 className="font-semibold">Menu preview</h3><p className="small muted mt-1">{isUser ? 'Combined active roles' : 'This role on its own'} · starts at {previewPages.find(p => p.href === landing)?.title || 'Account'}. Visibility does not grant extra actions; server permission and scope checks still apply.</p>{previewGroups.length ? <div className="mt-3 grid gap-4 sm:grid-cols-2">{previewGroups.map(group => <div key={group.id}><h4 className="small font-semibold">{group.title}</h4><ul className="small muted mt-1 space-y-1">{group.items.map(item => <li key={item.href}>{item.title}</li>)}</ul></div>)}</div> : <p className="small muted mt-3">No workspace menus are granted by this selection.</p>}</section>
    </form>
  </Dialog>;
}
