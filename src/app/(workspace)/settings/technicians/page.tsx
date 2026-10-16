'use client';
import { useListSearch, usePaginatedList } from '@/lib/api/use-paginated-list';
import { ListSearch } from '@/components/ui/list-search';
import { PermissionGate } from '@/components/ui/permission-gate';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import React, { useState, useEffect } from 'react';
import { useAddTechnicianSkill, useSkills } from '@/features/masters/hooks';
import { Technician } from '@/features/masters/api';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/resource-state';
import { FormErrorSummary } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';
import { MasterRowActions, ArchiveMasterDialog } from '@/features/masters/components/master-row-actions';
import { TechnicianEditDialog } from '@/features/masters/components/technician-edit-dialog';

interface ReassessmentQueueItem {
  id: string;
  itemType: 'SKILL' | 'CERTIFICATION';
  technicianId: string;
  technicianCode: string;
  technicianName: string;
  facilityId: string | null;
  referenceId: string;
  name: string;
  code: string;
  level?: number | null;
  assessmentStatus: string;
  validFrom: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  urgency: 'EXPIRED' | 'EXPIRING_SOON' | 'UNVERIFIED' | 'REVOKED';
  evidence?: string | null;
  notes?: string | null;
  assessedAt?: string | null;
  assessedBy?: string | null;
}

export default function TechniciansPage() {
  const [activeTab, setActiveTab] = useState<'technicians' | 'reassessment'>('technicians');
  const { search, setSearch, query } = useListSearch();
  const { data, isLoading, error, refetch, pagination } = usePaginatedList<Technician>('technicians', { search: query || undefined });
  const { data: skillsData } = useSkills();
  const skills = skillsData?.data || [];

  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [techToEdit, setTechToEdit] = useState<Technician | null>(null);
  const [techToArchive, setTechToArchive] = useState<Technician | null>(null);
  const [skillId, setSkillId] = useState('');
  const [skillLevel, setSkillLevel] = useState(2);
  const [skillStatus, setSkillStatus] = useState('VERIFIED');
  const [skillExpiresAt, setSkillExpiresAt] = useState('');
  const [skillError, setSkillError] = useState<ApiError | null>(null);

  // Overtime state
  const [overtimeTech, setOvertimeTech] = useState<Technician | null>(null);
  const [overtimeDate, setOvertimeDate] = useState('');
  const [overtimeStartTime, setOvertimeStartTime] = useState('18:00');
  const [overtimeEndTime, setOvertimeEndTime] = useState('21:00');
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false);
  const [overtimeError, setOvertimeError] = useState<string | null>(null);

  // Reassessment queue state
  const [queueItems, setQueueItems] = useState<ReassessmentQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [reassessItem, setReassessItem] = useState<ReassessmentQueueItem | null>(null);

  const addSkill = useAddTechnicianSkill(selectedTech?.id ?? '');
  const technicians = data?.data || [];

  const fetchReassessmentQueue = async () => {
    setQueueLoading(true);
    try {
      const res = await fetch('/api/technicians/reassessment-queue?daysAhead=30');
      if (res.ok) {
        const json = await res.json();
        setQueueItems(json.data || []);
      }
    } catch (e) {
      console.error('Failed to load reassessment queue', e);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reassessment') {
      fetchReassessmentQueue();
    }
  }, [activeTab]);

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
      refetch();
      if (activeTab === 'reassessment') fetchReassessmentQueue();
    } catch (err: any) {
      setSkillError(err);
    }
  };

  const handleRequestOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overtimeTech || !overtimeDate || !overtimeStartTime || !overtimeEndTime) return;
    setOvertimeSubmitting(true);
    setOvertimeError(null);

    const startAt = `${overtimeDate}T${overtimeStartTime}:00.000Z`;
    const endAt = `${overtimeDate}T${overtimeEndTime}:00.000Z`;

    try {
      const res = await fetch('/api/planning/overtime/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technicianId: overtimeTech.id,
          startAt,
          endAt,
          reason: overtimeReason || 'Operational workload overflow',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ message: 'Failed to request overtime' }));
        throw new Error(errJson.message || 'Overtime request failed');
      }

      setOvertimeTech(null);
      setOvertimeReason('');
    } catch (err: any) {
      setOvertimeError(err.message || 'Failed to submit overtime request');
    } finally {
      setOvertimeSubmitting(false);
    }
  };

  const columns: Column<Technician>[] = [
    {
      key: 'name',
      header: 'Technician / User',
      render: (t) => (
        <div>
          <span className="font-medium text-ink">{t.name || t.membership?.user?.name || 'Technician'}</span>
          <div className="text-xs text-muted font-mono">{t.code} • {t.membership?.user?.email}</div>
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
      header: 'Skills & Ratings (0-4)',
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
        <PermissionGate permission="resource.manage">
          <MasterRowActions
            onEdit={() => setTechToEdit(t)}
            onArchive={() => setTechToArchive(t)}
            extraActions={[
              { label: 'Assign Skill', icon: 'plus', onSelect: () => setSelectedTech(t) },
              { label: 'Request Overtime', icon: 'clock', onSelect: () => setOvertimeTech(t) },
            ]}
          />
        </PermissionGate>
      ),
    },
  ];

  const queueColumns: Column<ReassessmentQueueItem>[] = [
    {
      key: 'urgency',
      header: 'Urgency',
      render: (item) => {
        let variant: 'danger' | 'warning' | 'default' = 'default';
        if (item.urgency === 'EXPIRED' || item.urgency === 'REVOKED') variant = 'danger';
        else if (item.urgency === 'EXPIRING_SOON') variant = 'warning';
        return <Badge variant={variant} className="font-semibold">{item.urgency.replace('_', ' ')}</Badge>;
      },
    },
    {
      key: 'technician',
      header: 'Technician',
      render: (item) => (
        <div>
          <span className="font-medium text-ink">{item.technicianName}</span>
          <div className="text-xs text-muted font-mono">{item.technicianCode}</div>
        </div>
      ),
    },
    {
      key: 'qualification',
      header: 'Qualification',
      render: (item) => (
        <div>
          <span className="text-ink font-medium">{item.name}</span>
          <div className="text-xs text-muted">{item.itemType} • {item.code} {item.level != null ? `(Level ${item.level})` : ''}</div>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry & Days Left',
      render: (item) => (
        <div>
          <span className="text-xs text-ink">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'No expiry set'}</span>
          {item.daysUntilExpiry !== null && (
            <div className={`text-xs font-semibold ${item.daysUntilExpiry < 0 ? 'text-red-600' : item.daysUntilExpiry <= 14 ? 'text-amber-600' : 'text-muted'}`}>
              {item.daysUntilExpiry < 0 ? `${Math.abs(item.daysUntilExpiry)} days overdue` : `${item.daysUntilExpiry} days remaining`}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <Button
          size="small"
          variant="default"
          onClick={() => {
            const found = technicians.find((t) => t.id === item.technicianId);
            if (found) {
              setSelectedTech(found);
              setSkillId(item.referenceId);
              setSkillLevel(item.level ?? 2);
              setSkillStatus('VERIFIED');
            }
          }}
        >
          Reassess / Verify
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop Floor Technicians & Workforce Skills"
        description="Manage qualified machine operators, verified skill matrix (0–4 scale), expiration queues and overtime safety limits"
      />

      {/* Tabs */}
      <div className="flex border-b border-line gap-6">
        <button
          onClick={() => setActiveTab('technicians')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'technicians' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
        >
          All Technicians ({technicians.length})
        </button>
        <button
          onClick={() => setActiveTab('reassessment')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'reassessment' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
        >
          Reassessment & Expiry Queue (RES-05)
          {queueItems.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
              {queueItems.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'technicians' ? (
        <>
          <ListSearch value={search} onChange={setSearch} placeholder="Search technician, code or email…" label="Search technicians" />

          {error ? (
            <ErrorState message={(error as any)?.message || 'Failed to load technicians'} onRetry={() => refetch()} />
          ) : (
            <DataTable
              pagination={pagination}
              columns={columns}
              data={technicians}
              isLoading={isLoading}
              emptyTitle="No technicians linked"
              emptyDescription="Assign membership users to shop floor technician profiles to track operator skills and assignments."
            />
          )}
        </>
      ) : (
        <DataTable
          columns={queueColumns}
          data={queueItems}
          isLoading={queueLoading}
          emptyTitle="Reassessment Queue Clear"
          emptyDescription="All workforce skills and certifications are verified and within safe validity periods (> 30 days)."
        />
      )}

      {/* Edit and Archive Dialogs */}
      <TechnicianEditDialog technician={techToEdit} onClose={() => setTechToEdit(null)} />
      <ArchiveMasterDialog
        isOpen={!!techToArchive}
        onClose={() => setTechToArchive(null)}
        endpoint={`/api/resources/catalog/technicians/${techToArchive?.id}`}
        recordName={techToArchive?.name || techToArchive?.membership?.user?.name || 'technician'}
        onArchived={refetch}
      />

      {/* Assign / Reassess Skill Dialog */}
      <Dialog
        isOpen={!!selectedTech}
        onClose={() => setSelectedTech(null)}
        title={`Assign / Reassess Skill: ${selectedTech?.name || selectedTech?.membership?.user?.name || 'Technician'}`}
        subtitle="Qualify operator for specific manufacturing skills on the 0–4 scale"
      >
        <form onSubmit={handleAddSkill} className="space-y-4">
          <FormErrorSummary error={skillError} />
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Skill *
              <Select
                required
                value={skillId || (skills[0]?.id ?? '')}
                onChange={(e) => setSkillId(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              >
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </Select>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Proficiency Level (0 - 4 scale)
              <Input
                type="number"
                min={0}
                max={4}
                value={skillLevel}
                onChange={(e) => setSkillLevel(Number(e.target.value))}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              />
            </label>
            <p className="text-xs text-muted mt-1">Level 0: No skill • Level 1: In-training • Level 2: Supervised • Level 3: Autonomous • Level 4: Expert</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Assessment Status
              <Select
                value={skillStatus}
                onChange={(e) => setSkillStatus(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              >
                <option value="VERIFIED">VERIFIED (Full Qualification)</option>
                <option value="OBSERVED">OBSERVED (Under Evaluation)</option>
                <option value="CLAIMED">CLAIMED (Unverified)</option>
                <option value="REVOKED">REVOKED (Suspended)</option>
              </Select>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Validity Expiration Date (Optional)
              <Input
                type="date"
                value={skillExpiresAt}
                onChange={(e) => setSkillExpiresAt(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <Button variant="ghost" onClick={() => setSelectedTech(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={addSkill.isPending}>
              {addSkill.isPending ? 'Saving...' : 'Record Qualification'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Request Overtime Dialog */}
      <Dialog
        isOpen={!!overtimeTech}
        onClose={() => setOvertimeTech(null)}
        title={`Request Overtime Shift: ${overtimeTech?.name || overtimeTech?.code}`}
        subtitle="Subject to daily safety limit of 8 hours and supervisor approval"
      >
        <form onSubmit={handleRequestOvertime} className="space-y-4">
          {overtimeError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
              {overtimeError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Shift Date *
              <Input
                type="date"
                required
                value={overtimeDate}
                onChange={(e) => setOvertimeDate(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                Start Time *
                <Input
                  type="time"
                  required
                  value={overtimeStartTime}
                  onChange={(e) => setOvertimeStartTime(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                End Time *
                <Input
                  type="time"
                  required
                  value={overtimeEndTime}
                  onChange={(e) => setOvertimeEndTime(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
              Reason for Overtime *
              <Input
                required
                placeholder="e.g. Expedited batch recovery, urgent aerospace rush order"
                value={overtimeReason}
                onChange={(e) => setOvertimeReason(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary/20 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <Button variant="ghost" onClick={() => setOvertimeTech(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={overtimeSubmitting}>
              {overtimeSubmitting ? 'Submitting...' : 'Submit Overtime Request'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
