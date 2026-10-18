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
  title: 'Operation & Assignment Detail | ManuOS',
  description: 'Resource assignment, prerequisites, and operation material readiness.',
};

const statusLabelMap: Record<string, string> = {
  PENDING: 'Pending',
  READY: 'Ready',
  ASSIGNED: 'Assigned',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  WAITING_QC: 'Waiting QC',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
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
            <span>Production schedule</span>
          </Link>
          <div className="od-title-row">
            <span className="my-work-node">{task.nodeKey}</span>
            <h1>{task.nodeName}</h1>
            <Badge variant={getStatusVariant(task.status)}>
              {statusLabelMap[task.status] || task.status}
            </Badge>
            {(task.canStart || task.readinessReasons.length > 0) && <Badge variant={task.canStart ? 'success' : task.readinessReasons.length > 0 ? 'warning' : 'default'}>
              {task.canStart ? 'Ready to start' : task.readinessReasons.length > 0 ? `${task.readinessReasons.length} blocked prerequisites` : statusLabelMap[task.status] || task.status}
            </Badge>}
          </div>
          <p className="od-subtitle">
            Order <Link href={`/orders/${task.order.id}`} className="font-semibold text-primary hover:underline">{task.order.orderNumber}</Link> ({task.order.customerName}) · Item: <strong>{task.order.itemCode}</strong> — {task.order.itemName}
          </p>
        </div>

        <div className="od-actions">
          <ButtonLink href={`/orders/${task.order.id}`}>
            <Icon name="order" />
            <span>Order detail</span>
          </ButtonLink>
          {canAskAi && (
            <ButtonLink href={`/ai/assistant?taskId=${encodeURIComponent(task.id)}`} title="Ask about the status, duration, and orders related to this operation. The schedule does not change from this button.">
              <Icon name="spark" />
              <span>Ask AI about this operation</span>
            </ButtonLink>
          )}
          <ButtonLink href={`/shop-floor/tasks/${task.id}`} variant="primary">
            <Icon name="work" />
            <span>Open workstation</span>
          </ButtonLink>
        </div>
      </header>


      {task.readinessReasons.length > 0 && (
        <div className="od-banner warning" role="status">
          <span className="od-banner-icon" aria-hidden="true">
            <Icon name="alert" />
          </span>
          <div className="od-banner-copy">
            <strong>This operation has prerequisites that must be completed</strong>
            <p>{task.readinessReasons.map((r) => r.message).join(' · ')}</p>
          </div>
          <div className="od-banner-tags">
            {task.readinessReasons.map((r) => (
              <span key={r.code} className="od-tag">
                {r.code === 'MISSING_ASSIGNMENT'
                  ? 'Technician needed'
                  : r.code === 'MATERIAL_SHORTAGE'
                    ? 'Material shortage'
                    : r.code === 'PREDECESSOR_INCOMPLETE'
                      ? 'Active predecessor'
                      : r.code}
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="od-facts" aria-label="Operation summary">
        <div className="od-fact">
          <span>Assigned technician</span>
          <strong>{task.assignedTechnician ? task.assignedTechnician.name : 'Not assigned'}</strong>
          <small>{task.assignedTechnician ? `Code ${task.assignedTechnician.code}` : 'Assign via production schedule'}</small>
        </div>
        <div className="od-fact">
          <span>Machine / workstation</span>
          <strong>{task.assignedMachine ? task.assignedMachine.name : 'Not assigned'}</strong>
          <small>{task.assignedMachine ? `Code ${task.assignedMachine.code}` : 'Workstation not selected'}</small>
        </div>
        <div className="od-fact">
          <span>Actual / planned time</span>
          <strong>{task.currentElapsedMinutes} / {task.plannedDurationMinutes} min</strong>
          <small>Attempt {task.attemptNumber}</small>
        </div>
        <div className="od-fact">
          <span>Stage output / target</span>
          <strong>{recordedQty} / {targetQty} units</strong>
          <small>{remainingQty} units can still be recorded</small>
        </div>
      </section>

      <div className="od-grid">
        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Work reference</h3>
              <p>Engineering revisions and drawings for this operation</p>
            </div>
            <Badge variant={task.assignedTechnician && task.assignedMachine ? 'success' : 'warning'}>
              {task.assignedTechnician && task.assignedMachine ? 'Complete' : 'Needs allocation'}
            </Badge>
          </header>
          <dl className="od-kv">
            <div>
              <dt>Engineering revision</dt>
              <dd>
                {task.workInstruction
                  ? `Rev #${task.workInstruction.engineeringRevisionNumber} · Workflow v${task.workInstruction.workflowVersionNumber}`
                  : `Instruction v${task.instructionRevision}`}
              </dd>
            </div>
            <div>
              <dt>Technical drawing</dt>
              <dd>
                {task.workInstruction?.drawingNumber
                  ? `${task.workInstruction.drawingNumber}${task.workInstruction.revisionCode ? ` (${task.workInstruction.revisionCode})` : ''}`
                  : 'No drawing attached'}
              </dd>
            </div>
          </dl>
          <div className="od-card-foot">
            <span>Resource scheduling</span>
            <Link href="/planning" className="font-semibold text-primary hover:underline">
              Manage in production schedule →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Sequence & start readiness</h3>
              <p>Predecessor operations and execution prerequisites</p>
            </div>
            <Badge variant={task.predecessors.every((p) => p.isCompleted) ? 'success' : 'warning'}>
              {task.predecessors.length === 0
                ? 'No predecessors'
                : `${task.predecessors.filter((p) => p.isCompleted).length}/${task.predecessors.length} complete`}
            </Badge>
          </header>

          {task.predecessors.length === 0 ? (
            <div className="od-callout is-success">
              <Icon name="check" />
              <div>
                <strong>No predecessor operations</strong>
                <p>This operation does not wait for another operation to finish. Start readiness still follows the prerequisites below.</p>
              </div>
            </div>
          ) : (
            <dl className="od-kv">
              {task.predecessors.map((p) => (
                <div key={p.taskId}>
                  <dt>
                    <Link href={`/planning/tasks/${p.taskId}`} className="font-semibold text-primary hover:underline">
                      Operation {p.nodeKey}
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
              <dt>Start readiness status</dt>
              <dd>{task.canStart ? 'All start conditions met' : 'Awaiting prerequisites'}</dd>
            </div>
            <div>
              <dt>Blocked prerequisites</dt>
              <dd>{task.readinessReasons.length === 0 ? 'None' : `${task.readinessReasons.length} items`}</dd>
            </div>
          </dl>

          <div className="od-card-foot">
            <span>Order workflow</span>
            <Link href={`/orders/${task.order.id}`} className="font-semibold text-primary hover:underline">
              View order routing →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Operation material readiness</h3>
              <p>BOM component needs and WIP allocation for this operation</p>
            </div>
            <Badge
              variant={
                demands.length === 0 || demands.every((d) => BigInt(d.issuedAtoms) >= BigInt(d.requiredAtoms))
                  ? 'success'
                  : 'warning'
              }
            >
              {demands.length === 0
                ? 'No composition'
                : demands.every((d) => BigInt(d.issuedAtoms) >= BigInt(d.requiredAtoms))
                  ? 'Covered'
                  : 'Needs WIP issue'}
            </Badge>
          </header>

          {demands.length === 0 ? (
            <div className="od-callout">
              <Icon name="info" />
              <div>
                <strong>No direct BOM material requirements</strong>
                <p>Operation {task.nodeKey} does not require additional components beyond previous WIP.</p>
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
                      <span>WIP {issuedQty} / {reqQty} units</span>
                      <span className="block text-xs text-muted font-normal">Reserved: {reservedQty} units</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}

          <div className="od-card-foot">
            <span>Material issue</span>
            <Link href="/inventory/issues/new" className="font-semibold text-primary hover:underline">
              Issue material to WIP →
            </Link>
          </div>
        </section>

        <section className="od-card">
          <header className="od-card-head">
            <div>
              <h3>Session history</h3>
              <p>Actual time records from shop-floor operators</p>
            </div>
            <Badge variant={task.activeSession ? 'blue' : 'default'}>
              {task.activeSession ? 'Active session' : `${task.sessions.length} sessions`}
            </Badge>
          </header>

          {task.sessions.length === 0 ? (
            <div className="od-callout">
              <Icon name="clock" />
              <div>
                <strong>No execution sessions recorded</strong>
                <p>This operation has not been started by an operator. Open workstation to begin and record work.</p>
              </div>
            </div>
          ) : (
            <dl className="od-kv">
              {task.sessions.slice(0, 5).map((session) => (
                <div key={session.id}>
                  <dt>
                    <strong className="text-ink">{session.technicianName || 'Operator'}</strong>
                    <span className="block text-xs text-muted">
                      {session.sessionType === 'RUNNING' ? 'Active work session' : 'Paused session'}
                    </span>
                  </dt>
                  <dd>
                    {session.durationMinutes != null ? `${session.durationMinutes} min` : 'Running'}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="od-card-foot">
            <span>Shop-floor execution</span>
            <Link href={`/shop-floor/tasks/${task.id}`} className="font-semibold text-primary hover:underline">
              Open operation workstation →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
