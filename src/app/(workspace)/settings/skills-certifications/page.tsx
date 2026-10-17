'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { CertificationCatalog } from '@/features/masters/components/certification-catalog';
import React, { useState } from 'react';

import { Skill } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateSkillModal } from '@/features/masters/components/resource-forms';
import { ArchiveMasterDialog, MasterRowActions } from '@/features/masters/components/master-row-actions';
import { CatalogNameEditDialog } from '@/features/masters/components/catalog-name-edit-dialog';

export default function SkillsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillToArchive, setSkillToArchive] = useState<Skill | null>(null);
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Skill>('skills', { search: query || undefined });

  const skills = data?.data || [];

  const columns: Column<Skill>[] = [
    {
      key: 'code',
      header: 'Skill Code',
      render: (s) => <span className="font-mono font-semibold text-primary">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Skill Name',
      render: (s) => <span className="font-medium text-ink">{s.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (s) => <span className="font-mono text-xs text-ink">{s.category}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (skill) => (
        <PermissionGate permission="resource.manage">
          <MasterRowActions onEdit={() => setSelectedSkill(skill)} onArchive={() => setSkillToArchive(skill)} />
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Skills & Certifications" description="Manage technical competency standards, operator qualifications and licensing" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Skill
        </Button></PermissionGate></>} />

      <ListSearch value={search} onChange={setSearch} placeholder="Search skill code or name…" label="Search skills and certifications" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load skills'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          pagination={pagination}
          columns={columns}
          data={skills}
          isLoading={isLoading}
          emptyTitle="No skills defined"
          emptyDescription="Define skills (e.g. 5-Axis Milling, TIG Welding, CMM Operation) to enforce dispatch requirements."
        />
      )}

      <CertificationCatalog />
      <CreateSkillModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <CatalogNameEditDialog resource="skills" record={selectedSkill} onClose={() => setSelectedSkill(null)} />
      <ArchiveMasterDialog
        isOpen={!!skillToArchive}
        onClose={() => setSkillToArchive(null)}
        endpoint={`/api/resources/catalog/skills/${skillToArchive?.id}`}
        recordName={skillToArchive?.name || 'skill'}
        onArchived={refetch}
      />
    </div>
  );
}
