'use client';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import React, { useState } from 'react';
import { useSkills } from '@/features/masters/hooks';
import { Skill } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateSkillModal } from '@/features/masters/components/resource-forms';

export default function SkillsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useSkills();

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
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Skills & Certifications" description="Manage technical competency standards, operator qualifications and licensing" actions={<><PermissionGate permission="resource.manage"><Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Skill
        </Button></PermissionGate></>} />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load skills'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={skills}
          isLoading={isLoading}
          emptyTitle="No skills defined"
          emptyDescription="Define skills (e.g. 5-Axis Milling, TIG Welding, CMM Operation) to enforce dispatch requirements."
        />
      )}

      <CreateSkillModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
