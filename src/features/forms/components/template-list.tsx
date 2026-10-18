'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { FormTemplateDTO } from '@/server/modules/forms/contracts';

import React, { useState } from 'react';
import { Icon } from '@/components/icons';
import { Dialog } from '@/components/ui/dialog';
import { Tabs } from '@/components/ui/tabs';
import { ListSearch } from '@/components/ui/list-search';
import { ErrorState } from '@/components/ui/resource-state';
import Link from 'next/link';
import { useCreateFormTemplate } from '../hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGate } from '@/components/ui/permission-gate';

export function TemplateList() {
  const createMutation = useCreateFormTemplate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterPurpose, setFilterPurpose] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: templatesRes, isLoading, error, refetch, pagination } = usePaginatedList<FormTemplateDTO>('forms', { search: searchQuery, purpose: filterPurpose });

  // New form modal state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<'ORDER_SPEC' | 'TASK_EVIDENCE' | 'QC_EVIDENCE'>('ORDER_SPEC');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const templates = templatesRes?.data || [];

  const filtered = templates;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await createMutation.mutateAsync({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        purpose,
        description: description.trim() || undefined,
      });
      setIsModalOpen(false);
      setCode('');
      setName('');
      setDescription('');
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  return (
    <div className="page-stack template-library">
      <PageHeader
        title="Form Templates"
        description="Versioned schema-driven form templates for orders, work evidence, and quality inspections."
        actions={
          <PermissionGate permission="forms.create">
            <Button variant="primary" icon="plus" onClick={() => setIsModalOpen(true)}>
              Create template
            </Button>
          </PermissionGate>
        }
      />

      <div className="ov-toolbar">
        <Tabs variant="underline" activeId={filterPurpose} onChange={setFilterPurpose} ariaLabel="Template purpose" items={[{ id: 'ALL', label: 'All templates' }, { id: 'ORDER_SPEC', label: 'Order specifications' }, { id: 'TASK_EVIDENCE', label: 'Work evidence' }, { id: 'QC_EVIDENCE', label: 'Quality evidence' }]} />
        <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search name or template code…" label="Search templates" />
      </div>
      <div className="ov-section-title"><div><h2>Template library</h2><p>Manage definitions and published versions for each evidence workflow.</p></div><span>{pagination.total} matching templates</span></div>
      {/* Templates List */}
      {isLoading ? <Panel><p className="ov-loading">Loading form templates…</p></Panel> : error ? <ErrorState message="Failed to load form templates." onRetry={() => refetch()} /> : filtered.length === 0 ? <Panel><div className="ov-loading"><Icon name="file" /><p>No templates match these filters.</p><Button onClick={() => { setSearchQuery(''); setFilterPurpose('ALL'); }}>Clear filters</Button></div></Panel> : <div className="ft-grid">
        {filtered.map((tpl) => <Panel className="ft-template" key={tpl.id}>
          <div className="ft-template-top"><span className="ft-symbol"><Icon name={tpl.purpose === 'QC_EVIDENCE' ? 'shield' : tpl.purpose === 'TASK_EVIDENCE' ? 'work' : 'file'} /></span><Badge variant={tpl.publishedVersion ? 'success' : 'default'}>{tpl.publishedVersion ? `Published v${tpl.publishedVersion.versionNumber}` : 'Not published'}</Badge></div>
          <Link className="ft-template-name" href={`/settings/forms/${tpl.id}`}>{tpl.name}</Link>
          <span className="ft-template-code">{tpl.code}</span>
          <p className="ft-description">{tpl.description || 'No description added.'}</p>
          <div className="ft-template-footer"><span>{tpl.purpose === 'ORDER_SPEC' ? 'Order specification' : tpl.purpose === 'QC_EVIDENCE' ? 'Quality evidence' : 'Work evidence'}<small>{tpl.versionsCount} {tpl.versionsCount === 1 ? 'version' : 'versions'}</small></span><Link href={`/settings/forms/${tpl.id}`} className="btn small-btn">Open template<Icon name="arrow" /></Link></div>
        </Panel>)}
      </div>}

      {/* Centered Modal for Template Creation (Consistent Design Contract) */}
      {isModalOpen && (
        <Dialog isOpen type="modal" size="md" title="New form template" subtitle="Define a reusable form for orders, work, or quality evidence." onClose={() => setIsModalOpen(false)} pending={createMutation.isPending}>

            {createError && (
              <div className="p-3 text-sm text-danger bg-danger-soft rounded-md border border-danger/20">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <FormField id="new-tpl-name" label="Template Name" required>
                <Input
                  id="new-tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Paint Coating Evidence"
                  required
                />
              </FormField>

              <FormField id="new-tpl-code" label="Template Code" required help="Unique capital code">
                <Input
                  id="new-tpl-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. QC_PAINT_EVIDENCE"
                  required
                />
              </FormField>

              <FormField id="new-tpl-purpose" label="Form Purpose" required>
                <Select
                  id="new-tpl-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as any)}
                >
                  <option value="ORDER_SPEC">Order Specifications</option>
                  <option value="TASK_EVIDENCE">Task Evidence (Shop Floor)</option>
                  <option value="QC_EVIDENCE">QC Inspection Evidence</option>
                </Select>
              </FormField>

              <FormField id="new-tpl-desc" label="Description">
                <Textarea
                  id="new-tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this form used for…"
                  rows={2}
                />
              </FormField>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <Button variant="default" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create template'}
                </Button>
              </div>
            </form>
        </Dialog>
      )}
      <Pagination {...pagination} />
    </div>
  );
}
