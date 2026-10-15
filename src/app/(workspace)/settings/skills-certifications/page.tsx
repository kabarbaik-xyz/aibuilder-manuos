'use client';

import React, { useState } from 'react';
import { useSkills } from '@/features/masters/hooks';
import { Skill } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/resource-state';
import { CreateSkillDrawer } from '@/features/masters/components/resource-forms';

export default function SkillsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isLoading, error, refetch } = useSkills();

  const skills = data?.data || [];

  const columns: Column<Skill>[] = [
    {
      key: 'code',
      header: 'Skill Code',
      render: (s) => <span className="font-mono font-semibold text-blue-400">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Skill Name',
      render: (s) => <span className="font-medium text-neutral-100">{s.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (s) => <span className="font-mono text-xs text-neutral-300">{s.category}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Skills & Certifications</h1>
          <p className="text-sm text-neutral-400">Manage technical competency standards, operator qualifications and licensing</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setIsCreateOpen(true)}>
          New Skill
        </Button>
      </div>

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

      <CreateSkillDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
