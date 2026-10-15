'use client';

import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import { useTechnicians, useAddTechnicianSkill, useSkills } from '@/features/masters/hooks';
import { Technician } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/resource-state';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';

export default function TechniciansPage() {
  const { data, isLoading, error, refetch } = useTechnicians();
  const { data: skillsData } = useSkills();
  const skills = skillsData?.data || [];

  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [skillId, setSkillId] = useState('');
  const [skillLevel, setSkillLevel] = useState(3);
  const [skillError, setSkillError] = useState<ApiError | null>(null);

  const addSkill = useAddTechnicianSkill(selectedTech?.id ?? '');

  const technicians = data?.data || [];

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTech) return;
    setSkillError(null);
    try {
      await addSkill.mutateAsync({
        skillId: skillId || (skills[0]?.id ?? ''),
        level: Number(skillLevel),
      });
      setSelectedTech(null);
    } catch (err: any) {
      setSkillError(err);
    }
  };

  const columns: Column<Technician>[] = [
    {
      key: 'name',
      header: 'Technician / User',
      render: (t) => (
        <div>
          <span className="font-medium text-ink">{t.name || t.membership?.user?.name || 'Technician'}</span>
          <div className="text-xs text-muted">{t.membership?.user?.email}</div>
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Hourly Rate',
      render: (t) => <span className="text-ink">{t.hourlyRateCents != null ? `$${(t.hourlyRateCents / 100).toFixed(2)}/hr` : '—'}</span>,
    },
    {
      key: 'skills',
      header: 'Skills',
      render: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.skills && t.skills.length > 0 ? (
            t.skills.map((s) => (
              <Badge key={s.id} variant="default" className="text-xs">
                {s.skill?.code} (L{s.level})
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted italic">None</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Badge variant={t.status === 'ACTIVE' ? 'success' : t.status === 'ON_LEAVE' ? 'warning' : 'default'}>
          {t.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (t) => (
        <PermissionGate permission="resource.manage"><Button variant="default" size="small" onClick={(e) => { e.stopPropagation(); setSelectedTech(t); }}>
          Add Skill
        </Button></PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Shop Floor Technicians" description="Manage qualified machine operators, skill ratings and certifications" />

      {error ? (
        <ErrorState message={(error as any)?.message || 'Failed to load technicians'} onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={technicians}
          isLoading={isLoading}
          emptyTitle="No technicians linked"
          emptyDescription="Assign membership users to shop floor technician profiles to track operator skills and assignments."
        />
      )}

      {/* Add Skill Dialog */}
      <Dialog
        isOpen={!!selectedTech}
        onClose={() => setSelectedTech(null)}
        title={`Assign Skill: ${selectedTech?.membership?.user?.name || 'Technician'}`}
        subtitle="Qualify operator for specific manufacturing skills"
      >
        <form onSubmit={handleAddSkill} className="space-y-4">
          <FormErrorSummary error={skillError} />
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Skill *
            <Select
              required
              value={skillId || (skills[0]?.id ?? '')}
              onChange={(e) => setSkillId(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            >
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select></label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Proficiency Level (1 - 5)
            <Input
              type="number"
              min={1}
              max={5}
              value={skillLevel}
              onChange={(e) => setSkillLevel(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
            /></label>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <PermissionGate permission="resource.manage"><Button variant="ghost" onClick={() => setSelectedTech(null)}>Cancel</Button></PermissionGate>
            <Button type="submit" variant="primary" disabled={addSkill.isPending}>
              {addSkill.isPending ? 'Saving...' : 'Assign Skill'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
