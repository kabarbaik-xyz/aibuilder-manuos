'use client';
import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { Pagination } from '@/components/ui/pagination';
import type { FormTemplateDTO } from '@/server/modules/forms/contracts';

import React, { useState } from 'react';
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

export function TemplateList() {
  const createMutation = useCreateFormTemplate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterPurpose, setFilterPurpose] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: templatesRes, isLoading, error, pagination } = usePaginatedList<FormTemplateDTO>('forms', { search: searchQuery, purpose: filterPurpose });

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
    <div className="space-y-6">
      <PageHeader
        title="Form Templates"
        description="Versioned schema-driven form templates for orders, work evidence, and quality inspections."
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + Create Template
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            className="w-full sm:w-64"
          />
          <Select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="w-auto"
          >
            <option value="ALL">All Purposes</option>
            <option value="ORDER_SPEC">Order Specifications</option>
            <option value="TASK_EVIDENCE">Task Evidence</option>
            <option value="QC_EVIDENCE">QC Evidence</option>
          </Select>
        </div>

        <span className="text-xs text-muted">
          {pagination.total} templates
        </span>
      </div>

      {/* Templates List */}
      <Panel>
        {isLoading ? (
          <p className="text-sm text-muted p-4 text-center">Loading form templates…</p>
        ) : error ? (
          <p className="text-sm text-danger p-4 text-center">Failed to load form templates.</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm text-muted">No form templates found matching your criteria.</p>
            <Button variant="default" size="small" onClick={() => setIsModalOpen(true)}>
              Create your first template
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between p-4 hover:bg-surface-muted transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/settings/forms/${tpl.id}`}
                      className="font-semibold text-ink hover:text-primary transition-colors"
                    >
                      {tpl.name}
                    </Link>
                    <span className="font-mono text-xs text-muted">({tpl.code})</span>
                    <Badge
                      variant={
                        tpl.purpose === 'ORDER_SPEC'
                          ? 'blue'
                          : tpl.purpose === 'QC_EVIDENCE'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {tpl.purpose}
                    </Badge>
                  </div>
                  {tpl.description && (
                    <p className="text-xs text-muted line-clamp-1">{tpl.description}</p>
                  )}
                  <span className="text-xs text-muted block">
                    {tpl.versionsCount} version(s) · Published: {tpl.publishedVersion ? `v${tpl.publishedVersion.versionNumber}` : 'None'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/forms/${tpl.id}`}
                    className="text-xs font-medium text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary-soft/10"
                  >
                    Open Editor →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Centered Modal for Template Creation (Consistent Design Contract) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-ink">New Form Template</h2>

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
                  {createMutation.isPending ? 'Creating…' : 'Create & Open Editor'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Pagination {...pagination} />
    </div>
  );
}
