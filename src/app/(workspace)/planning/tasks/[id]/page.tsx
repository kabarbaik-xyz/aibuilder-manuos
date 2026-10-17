import React from 'react';
import Link from 'next/link';
import { requirePrincipal } from '@/server/auth/auth';
import { headers } from 'next/headers';
import { executionService } from '@/server/modules/execution/service';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button-link';
import { Icon } from '@/components/icons';
import { formatQuantity } from '@/domain/quantity';
import { notFound } from 'next/navigation';
import { NotFoundError } from '@/domain/errors';

export const metadata = {
  title: 'Detail Operasi & Penugasan | ManuOS',
  description: 'Rincian penugasan sumber daya, prasyarat, dan kesiapan material operasi.',
};

const statusLabelMap: Record<string, string> = {
  PENDING: 'Menunggu',
  READY: 'Siap',
  ASSIGNED: 'Ditugaskan',
  RUNNING: 'Sedang berjalan',
  PAUSED: 'Paused',
  WAITING_QC: 'Waiting QC',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

function getStatusVariant(status: string): 'default' | 'blue' | 'success' | 'warning' | 'danger' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING' || status === 'ASSIGNED') return 'blue';
  if (status === 'PAUSED' || status === 'WAITING_QC') return 'warning';
  if (status === 'CANCELLED') return 'danger';
  return 'default';
}

export default async function PlanningTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await headers();
  const principal = await requirePrincipal(h);
  let task: Awaited<ReturnType<typeof executionService.getTaskExecutionDetail>>;
  try {
    task = await executionService.getTaskExecutionDetail(principal, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canAskAi =
    principal.permissions?.has?.('planning.read') ||
    (principal.permissions?.has?.('task.assign') && Boolean(principal.technicianId));
  const demands = task.materialReadiness?.demands ?? [];
  const targetQty = formatQuantity(BigInt(task.order.targetAtoms || '0'));
  const recordedQty = formatQuantity(BigInt(task.stageQuantitySummary?.cumulativeRecordedAtoms || '0'));
  const remainingQty = formatQuantity(BigInt(task.stageQuantitySummary?.remainingRecordableAtoms || '0'));

  return (
    <div className="page-stack planning-task-detail">
      <header className="od-header">
        <div className="od-identity">
          <Link href="/planning" className="od-back">
            <Icon name="arrow-left" />
            <span>Jadwal produksi</span>
          </Link>
          <div className="od-title-row">
            <span className="my-work-node">{task.nodeKey}</span>
            <h1>{task.nodeName}</h1>
            <Badge variant={getStatusVariant(task.status)}>
              {statusLabelMap[task.status] || task.status}
            </Badge>
            {(task.canStart || task.readinessReasons.length > 0) && <Badge variant={task.canStart ? 'success' : task.readinessReasons.length > 0 ? 'warning' : 'default'}>
              {task.canStart ? 'Siap mulai' : task.readinessReasons.length > 0 ? `${task.readinessReasons.length} prasyarat tertahan` : statusLabelMap[task.status] || task.status}
            </Badge>}
          </div>
          <p className="od-subtitle">
            Order <Link href={`/orders/${task.order.id}`} className="font-semibold text-primary hover:underline">{task.order.orderNumber}</Link> ({task.order.customerName}) · Item: <strong>{task.order.itemCode}</strong> — {task.order.itemName}
          </p>
        </div>

        <div className="od-actions">
          <ButtonLink href={`/orders/${task.order.id}`}>
            <Icon name="order" />
            <span>Detail order</span>
          </ButtonLink>
          {canAskAi && (
            <ButtonLink href={`/ai/assistant?taskId=${encodeURIComponent(task.id)}`} title="Tanyakan status, durasi, dan order terkait operasi ini. Jadwal tidak berubah dari tombol ini.">
              <Icon name="spark" />
              <span>Tanya AI tentang operasi</span>
            </ButtonLink>
          )}
          <ButtonLink href={`/shop-floor/tasks/${task.id}`} variant="primary">
            <Icon name="work" />
            <span>Buka workstation</span>
          </ButtonLink>
        </div>
      </header>


      {task.readinessReasons.length > 0 && (
        <div className="od-banner warning" role="status">
          <span className="od-banner-icon" aria-hidden="true">
            <Icon name="alert" />
          </span>
          <div className="od-banner-copy">
            <strong>Operasi memiliki prasyarat yang perlu diselesaikan</strong>
            <p>{task.readinessReasons.map((r) => r.message).join(' · ')}</p>
          </div>
          <div className="od-banner-tags">
            {task.readinessReasons.map((r) => (
              <span key={r.code} className="od-tag">
                {r.code === 'MISSING_ASSIGNMENT'
                  ? 'Perlu teknisi'
                  : r.code === 'MATERIAL_SHORTAGE'
                    ? 'Material kurang'
                    : r.code === 'PREDECESSOR_INCOMPLETE'
                      ? 'Pendahulu aktif'
                      : r.code}
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="od-facts" aria-label="Ringkasan operasi">
        <div className="od-fact">
          <span>Teknisi ditugaskan</span>
          <strong>{task.assignedTechnician ? task.assignedTechnician.name : 'Belum ditugaskan'}</strong>
          <small>{task.assignedTechnician ? `Kode ${task.assignedTechnician.code}` : 'Tetapkan melalui jadwal produksi'}</small>
        </div>
        <div className="od-fact">
          <span>Mesin / stasiun kerja</span>
          <strong>{task.assignedMachine ? task.assignedMachine.name : 'Belum ditugaskan'}</strong>
          <small>{task.assignedMachine ? `Kode ${task.assignedMachine.code}` : 'Stasiun kerja belum dipilih'}</small>
        </div>
        <div className="od-fact">
          <span>Waktu aktual / rencana</span>
          <strong>{task.currentElapsedMinutes} / {task.plannedDurationMinutes} mnt</strong>
          <small>Percobaan ke-{task.attemptNumber}</small>
        </div>
        <div className="od-fact">
          <span>Hasil tahap / target</span>
          <strong>{recordedQty} / {targetQty} unit</strong>
          <small>Sisa {remainingQty} unit dapat dicatat</small>
        </div>
      </section>

      <div className="od-grid">
        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Acuan kerja</h3>
              <p>Revisi engineering dan gambar untuk operasi ini</p>
            </div>
            <Badge variant={task.assignedTechnician && task.assignedMachine ? 'success' : 'warning'}>
              {task.assignedTechnician && task.assignedMachine ? 'Lengkap' : 'Perlu alokasi'}
            </Badge>
          </header>
          <dl className="od-kv">
            <div>
              <dt>Revisi engineering</dt>
              <dd>
                {task.workInstruction
                  ? `Rev #${task.workInstruction.engineeringRevisionNumber} · Workflow v${task.workInstruction.workflowVersionNumber}`
                  : `Instruksi v${task.instructionRevision}`}
              </dd>
            </div>
            <div>
              <dt>Gambar teknik</dt>
              <dd>
                {task.workInstruction?.drawingNumber
                  ? `${task.workInstruction.drawingNumber}${task.workInstruction.revisionCode ? ` (${task.workInstruction.revisionCode})` : ''}`
                  : 'Tidak ada lampiran gambar'}
              </dd>
            </div>
          </dl>
          <div className="od-card-foot">
            <span>Penjadwalan sumber daya</span>
            <Link href="/planning" className="font-semibold text-primary hover:underline">
              Kelola di jadwal produksi →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Urutan & kesiapan mulai</h3>
              <p>Operasi pendahulu dan prasyarat eksekusi</p>
            </div>
            <Badge variant={task.predecessors.every((p) => p.isCompleted) ? 'success' : 'warning'}>
              {task.predecessors.length === 0
                ? 'Tanpa pendahulu'
                : `${task.predecessors.filter((p) => p.isCompleted).length}/${task.predecessors.length} selesai`}
            </Badge>
          </header>

          {task.predecessors.length === 0 ? (
            <div className="od-callout is-success">
              <Icon name="check" />
              <div>
                <strong>Tidak ada operasi pendahulu</strong>
                <p>Operasi ini tidak perlu menunggu penyelesaian operasi lain. Kesiapan mulai tetap mengikuti prasyarat di bawah.</p>
              </div>
            </div>
          ) : (
            <dl className="od-kv">
              {task.predecessors.map((p) => (
                <div key={p.taskId}>
                  <dt>
                    <Link href={`/planning/tasks/${p.taskId}`} className="font-semibold text-primary hover:underline">
                      Operasi {p.nodeKey}
                    </Link>
                  </dt>
                  <dd>
                    <Badge variant={p.isCompleted ? 'success' : 'warning'}>
                      {statusLabelMap[p.status] || p.status}
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <dl className="od-kv">
            <div>
              <dt>Status kesiapan mulai</dt>
              <dd>{task.canStart ? 'Memenuhi seluruh syarat mulai' : 'Menunggu pemenuhan prasyarat'}</dd>
            </div>
            <div>
              <dt>Prasyarat tertahan</dt>
              <dd>{task.readinessReasons.length === 0 ? 'Tidak ada' : `${task.readinessReasons.length} item`}</dd>
            </div>
          </dl>

          <div className="od-card-foot">
            <span>Alur kerja order</span>
            <Link href={`/orders/${task.order.id}`} className="font-semibold text-primary hover:underline">
              Lihat routing order →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Kesiapan material operasi</h3>
              <p>Kebutuhan komponen BOM dan alokasi WIP pada operasi ini</p>
            </div>
            <Badge
              variant={
                demands.length === 0 || demands.every((d) => BigInt(d.issuedAtoms) >= BigInt(d.requiredAtoms))
                  ? 'success'
                  : 'warning'
              }
            >
              {demands.length === 0
                ? 'Tanpa komposisi'
                : demands.every((d) => BigInt(d.issuedAtoms) >= BigInt(d.requiredAtoms))
                  ? 'Tercukupi'
                  : 'Perlu pengeluaran WIP'}
            </Badge>
          </header>

          {demands.length === 0 ? (
            <div className="od-callout">
              <Icon name="info" />
              <div>
                <strong>Tidak ada kebutuhan material BOM langsung</strong>
                <p>Operasi {task.nodeKey} tidak memerlukan komponen tambahan di luar WIP sebelumnya.</p>
              </div>
            </div>
          ) : (
            <dl className="od-kv">
              {demands.map((demand) => {
                const reqQty = formatQuantity(BigInt(demand.requiredAtoms));
                const issuedQty = formatQuantity(BigInt(demand.issuedAtoms));
                const reservedQty = formatQuantity(BigInt(demand.reservedAtoms));
                return (
                  <div key={demand.demandId}>
                    <dt>
                      <strong className="text-ink">{demand.itemCode}</strong>
                      <span className="block text-xs text-muted">{demand.itemName}</span>
                    </dt>
                    <dd>
                      <span>WIP {issuedQty} / {reqQty} unit</span>
                      <span className="block text-xs text-muted font-normal">Reservasi: {reservedQty} unit</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}

          <div className="od-card-foot">
            <span>Pengeluaran material</span>
            <Link href="/inventory/issues/new" className="font-semibold text-primary hover:underline">
              Keluarkan material ke WIP →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Riwayat sesi kerja</h3>
              <p>Catatan waktu aktual operator di lantai produksi</p>
            </div>
            <Badge variant={task.activeSession ? 'blue' : 'default'}>
              {task.activeSession ? 'Sesi aktif' : `${task.sessions.length} sesi`}
            </Badge>
          </header>

          {task.sessions.length === 0 ? (
            <div className="od-callout">
              <Icon name="clock" />
              <div>
                <strong>Belum ada sesi eksekusi tercatat</strong>
                <p>Operasi ini belum dimulai oleh operator. Buka workstation untuk memulai dan mencatat hasil kerja.</p>
              </div>
            </div>
          ) : (
            <dl className="od-kv">
              {task.sessions.slice(0, 5).map((session) => (
                <div key={session.id}>
                  <dt>
                    <strong className="text-ink">{session.technicianName || 'Operator'}</strong>
                    <span className="block text-xs text-muted">
                      {session.sessionType === 'RUNNING' ? 'Sesi kerja aktif' : 'Sesi jeda'}
                    </span>
                  </dt>
                  <dd>
                    {session.durationMinutes != null ? `${session.durationMinutes} mnt` : 'Sedang berjalan'}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="od-card-foot">
            <span>Eksekusi lantai produksi</span>
            <Link href={`/shop-floor/tasks/${task.id}`} className="font-semibold text-primary hover:underline">
              Buka workstation operasi →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
