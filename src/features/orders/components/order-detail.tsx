'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  Boxes,
  ExternalLink,
  ShieldCheck,
  FileCode,
  Check,
  AlertCircle,
  Building2,
  Calendar,
  Play,
  Plus,
  Layers,
  User,
  Cog,
  FileText,
} from 'lucide-react';
import { OrderDto } from '../api';
import { useReleaseOrder, useConfirmOrder, useAddCustomerQuestion, useOrderCosting, useRecordOrderCost, useCreateOrderChangeRequest } from '../hooks';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Icon } from '@/components/icons';
import { formatQuantity } from '@/domain/quantity';
import { apiRequest } from '@/lib/api/client';
import { PermissionGate } from '@/components/ui/permission-gate';
import { memoryHrefForItem } from '@/features/intelligence/memory-navigation';
import { SubjectFormEvidence } from '@/features/forms/components/subject-form-evidence';
import { OrderEvidenceTimeline } from './order-evidence-timeline';

interface OrderDetailProps {
  order: OrderDto;
}

interface CostVarianceExplanation {
  data: {
    currency: string | null;
    totalVarianceCents: string | null;
    coverage: { standard: boolean; actual: boolean };
    unavailableReason: string | null;
    contributors: Array<{ category: string; varianceCents: string; sourceEntryCount: number; sourceEntryIds: string[]; evidenceHref: string }>;
  };
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCents(centsStr?: string | bigint | number | null, currency?: string | null): string {
  if (centsStr === undefined || centsStr === null) return 'N/A';
  const cents = typeof centsStr === 'bigint' ? centsStr : BigInt(centsStr);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const major = new Intl.NumberFormat().format(absolute / 100n);
  const minor = (absolute % 100n).toString().padStart(2, '0');
  return `${currency ?? 'Currency unavailable'} ${negative ? '-' : ''}${major}.${minor}`;
}

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderDetail({ order }: OrderDetailProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'engineering' | 'production' | 'materials' | 'costing' | 'fulfillment'
  >('overview');
  const [newQuestion, setNewQuestion] = useState('');
  const queryClient = useQueryClient();
  const [customerDocument, setCustomerDocument] = useState<File | null>(null);
  const [publishDocumentToCustomer, setPublishDocumentToCustomer] = useState(false);
  const [documentUploadPending, setDocumentUploadPending] = useState(false);
  const [documentUploadMessage, setDocumentUploadMessage] = useState('');

  const releaseMutation = useReleaseOrder(order.id);
  const confirmMutation = useConfirmOrder(order.id);
  const addQuestionMutation = useAddCustomerQuestion(order.id);
  const costingQuery = useOrderCosting(order.id);
  const recordCostMutation = useRecordOrderCost(order.id);
  const changeRequestMutation = useCreateOrderChangeRequest(order.id);

  const handleOrderDocumentUpload = async () => {
    if (!customerDocument) return;
    setDocumentUploadPending(true);
    setDocumentUploadMessage('');
    const formData = new FormData();
    formData.set('file', customerDocument);
    formData.set('parentType', 'ORDER');
    formData.set('parentId', order.id);
    formData.set('customerVisible', String(publishDocumentToCustomer));
    try {
      const uploaded = await apiRequest<{ fileName: string }>('/api/documents/upload', { method: 'POST', body: formData });
      setDocumentUploadMessage(publishDocumentToCustomer
        ? `${uploaded.fileName} is available in this customer's portal.`
        : `${uploaded.fileName} was uploaded as an internal document.`);
      setCustomerDocument(null);
      setPublishDocumentToCustomer(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      setDocumentUploadMessage(error.message || 'Document upload failed.');
    } finally {
      setDocumentUploadPending(false);
    }
  };

  const [showCostModal, setShowCostModal] = useState(false);
  const [costCategory, setCostCategory] = useState("MATERIAL");
  const [costType, setCostType] = useState("ACTUAL");
  const [costAmountDollars, setCostAmountDollars] = useState("");
  const [costCurrency, setCostCurrency] = useState('IDR');
  const [costNotes, setCostNotes] = useState("");
  const [showCostExplanation, setShowCostExplanation] = useState(false);
  const [costExplanation, setCostExplanation] = useState<CostVarianceExplanation['data'] | null>(null);
  const [costExplanationError, setCostExplanationError] = useState<string | null>(null);
  const [costExplanationPending, setCostExplanationPending] = useState(false);

  async function toggleCostExplanation() {
    if (showCostExplanation) {
      setShowCostExplanation(false);
      return;
    }
    setShowCostExplanation(true);
    if (costExplanation || costExplanationPending) return;
    setCostExplanationPending(true);
    setCostExplanationError(null);
    try {
      const response = await apiRequest<CostVarianceExplanation>(`/api/orders/${encodeURIComponent(order.id)}/costing/explanation`);
      setCostExplanation(response.data);
    } catch (error) {
      setCostExplanationError(error instanceof Error ? error.message : 'Could not load the variance explanation.');
    } finally {
      setCostExplanationPending(false);
    }
  }

  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [changeType, setChangeType] = useState("DELIVERY_DATE");
  const [changeReason, setChangeReason] = useState("");
  const [requestedValue, setRequestedValue] = useState("");

  const latestEng = order.engineeringRevisions?.[0];
  const bomLines = order.engineeringRevisions?.flatMap(revision => (revision.bomLines ?? []).map((line: any) => ({
    ...line,
    engineeringRevisionId: revision.id,
    engineeringRevisionNumber: revision.revisionNumber,
    orderLineId: revision.orderLineId,
    outputBasisAtoms: revision.outputBasisAtoms ?? 1_000_000,
  }))) ?? [];
  const instance = order.instances?.[0];
  const approvedForEveryLine = order.lines?.length
    ? order.lines.every(line => order.engineeringRevisions?.some(revision =>
        revision.status === 'APPROVED' &&
        (revision.orderLineId === line.id || (order.lines?.length === 1 && revision.orderLineId == null))
      ))
    : latestEng?.status === 'APPROVED';
  const canRelease = approvedForEveryLine && Boolean(order.confirmedAt) && (order.status === 'READY' || order.status === 'DRAFT');
  const canConfirm = approvedForEveryLine && (order.status === 'DRAFT' || order.status === 'READY') && !order.confirmedAt;

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    addQuestionMutation.mutate(newQuestion.trim(), {
      onSuccess: () => setNewQuestion(''),
    });
  };

  const handleRecordCost = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = costAmountDollars.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return;
    const [whole, fractional = ''] = amount.split('.');
    const amountCents = (BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'))).toString();
    await recordCostMutation.mutateAsync({
      costCategory,
      costType,
      amountCents,
      currency: costCurrency,
      notes: costNotes.trim() || undefined,
    });
    setShowCostModal(false);
    setCostAmountDollars("");
    setCostNotes("");
  };

  const handleChangeRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await changeRequestMutation.mutateAsync({
      changeType,
      reason: changeReason.trim(),
      requestedChanges: { targetValue: requestedValue.trim() },
    });
    setShowChangeModal(false);
    setChangeReason("");
    setRequestedValue("");
  };

  const handleRelease = () => {
    releaseMutation.mutate();
  };

  const isDelivered = order.status === 'DELIVERED';
  const isShipped =
    order.status === 'DELIVERED' || order.status === 'PARTIALLY_DELIVERED';
  const latestShipment = order.shipments?.[0];

  const getStatusVariant = (
    status: string
  ): 'default' | 'success' | 'warning' | 'danger' | 'blue' => {
    switch (status) {
      case 'DELIVERED':
        return 'success';
      case 'PARTIALLY_DELIVERED':
      case 'IN_PRODUCTION':
      case 'RELEASED':
        return 'blue';
      case 'READY':
        return 'blue';
      case 'REVIEW':
        return 'warning';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'default';
    }
  };

  return (
    <div className="page-stack">
      {/* Page Header */}
      <header className="od-header">
        <div className="od-header-main">
          <Link href="/orders" className="od-back"><ArrowLeft className="w-3.5 h-3.5" /> All orders</Link>
          <div className="od-title-row">
            <h1>Order {order.orderNumber}</h1>
            <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
            {order.customerAcknowledged && <Badge variant="success">Customer acknowledged</Badge>}
          </div>
          <dl className="od-meta">
            <div><dt>Customer</dt><dd>{order.customer?.name || '—'} <span>({order.customer?.code || '—'})</span></dd></div>
            <div><dt>Type</dt><dd>{order.orderType?.name || 'Standard'}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(order.createdAt)}</dd></div>
          </dl>
        </div>
        <div className="od-actions">
          {canConfirm && <Button variant="primary" onClick={() => setShowConfirmModal(true)} disabled={confirmMutation.isPending}>Confirm order</Button>}
          {canRelease && (
            <Button variant="primary" onClick={handleRelease} disabled={releaseMutation.isPending}>
              <span className="inline-flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />{releaseMutation.isPending ? 'Releasing…' : 'Release to production'}</span>
            </Button>
          )}
          <ButtonLink href={`/ai/assistant?orderId=${encodeURIComponent(order.id)}`}>
            <span className="inline-flex items-center gap-1.5"><Icon name="spark" /> Ask AI</span>
          </ButtonLink>
          {['RELEASED', 'IN_PRODUCTION', 'PARTIALLY_DELIVERED'].includes(order.status) && <PermissionGate permission={['planning.read', 'task.assign']}><ButtonLink href={`/ai/promise?orderId=${encodeURIComponent(order.id)}`}>Check delivery date</ButtonLink></PermissionGate>}
          {latestEng && (
            <ButtonLink href={`/engineering/orders/${order.id}`}>
              <span className="inline-flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /> Engineering spec · {latestEng.status.toLowerCase()}</span>
            </ButtonLink>
          )}
          {latestShipment && (
            <ButtonLink href={`/delivery/shipments/${latestShipment.id}`}>
              <span className="inline-flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Shipment {latestShipment.shipmentNumber}</span>
            </ButtonLink>
          )}
        </div>
      </header>

      {/* Lifecycle status banner */}
      {isDelivered && (
        <div className="od-banner success">
          <span className="od-banner-icon"><Check className="w-4 h-4" /></span>
          <div className="od-banner-copy">
            <strong>Order delivered &amp; customer fulfilled</strong>
            <p>
              {latestShipment?.receivedBy ? (
                <>Received by <b>{latestShipment.receivedBy}</b>{latestShipment.deliveredAt && ` on ${formatDateTime(latestShipment.deliveredAt)}`}</>
              ) : 'Finished goods verified and received at customer destination.'}
            </p>
          </div>
          <div className="od-banner-tags">
            {latestShipment?.proofOfDelivery && <span className="od-tag">POD: {latestShipment.proofOfDelivery}</span>}
            <span className="od-tag"><ShieldCheck className="w-3.5 h-3.5" /> Ledger settled</span>
          </div>
        </div>
      )}
      {order.status === 'IN_PRODUCTION' && (
        <div className="od-banner info">
          <span className="od-banner-icon"><Play className="w-4 h-4" /></span>
          <div className="od-banner-copy">
            <strong>Order active in shop-floor production</strong>
            <p>Task graph running. Material reservations locked and operations in progress.</p>
          </div>
          <ButtonLink href="/planning">View planning</ButtonLink>
        </div>
      )}
      {order.status === 'READY' && (
        <div className="od-banner info">
          <span className="od-banner-icon"><CheckCircle2 className="w-4 h-4" /></span>
          <div className="od-banner-copy">
            <strong>Engineering approved · ready for release</strong>
            <p>BOM and routings are locked. Release to schedule operations and register supply demand.</p>
          </div>
          {canConfirm ? <Button variant="primary" onClick={() => setShowConfirmModal(true)}>Confirm order</Button> : canRelease && <Button variant="primary" onClick={handleRelease} disabled={releaseMutation.isPending}>Release to production</Button>}
        </div>
      )}

      {order.confirmedAt && <Panel className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div><strong className="text-sm text-ink">Order confirmed</strong><p className="small muted">Confirmed {formatDateTime(order.confirmedAt)}. Engineering release can now create the manufacturing jobs.</p></div>
        {canRelease && <Button variant="primary" onClick={handleRelease} disabled={releaseMutation.isPending}>{releaseMutation.isPending ? 'Releasing…' : 'Release to production'}</Button>}
      </Panel>}

      {order.lifecycleInstances?.[0] && (() => {
        const lifecycle = order.lifecycleInstances[0];
        return <Panel className="p-5 page-stack">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-base font-semibold text-ink">{lifecycle.workflowVersion.template.name}</h2><p className="field-help">Order lifecycle · version {lifecycle.workflowVersion.versionNumber} · stage ownership and handoffs</p></div>
            <Badge variant={lifecycle.status === 'COMPLETED' ? 'success' : lifecycle.status === 'BLOCKED' ? 'warning' : 'blue'}>{lifecycle.status.replaceAll('_', ' ').toLowerCase()}</Badge>
          </div>
          <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {lifecycle.stages.map((stage) => <li key={stage.id} className="rounded-lg border border-line bg-surface-muted p-3">
              <div className="flex items-start justify-between gap-2"><strong className="text-sm text-ink">{stage.name}</strong><Badge variant={stage.state === 'COMPLETED' ? 'success' : stage.state === 'BLOCKED' ? 'warning' : stage.state === 'READY' || stage.state === 'ACTIVE' ? 'blue' : 'default'}>{stage.state.replaceAll('_', ' ').toLowerCase()}</Badge></div>
              <p className="small muted mt-1">{stage.department.name} · {stage.action.replaceAll('_', ' ').toLowerCase()}</p>
              <p className="small mt-2 text-ink">{stage.assignedMembership?.user.name ?? 'Department queue'}</p>
              {stage.dueAt && <p className="small muted mt-1">Due {formatDateTime(stage.dueAt)}</p>}
              {!!stage.pinnedForms?.length && <div className="mt-3 border-t border-line pt-2">
                <p className="small muted">Pinned evidence forms</p>
                <ul className="mt-1 space-y-1">
                  {stage.pinnedForms.map((form, index) => <li key={`${form.contentHash}-${index}`} className="small text-ink">
                    {form.name}{form.version ? ` · v${form.version}` : ''} · {form.required ? 'required' : 'optional'} · {form.completionPoint.replaceAll('_', ' ').toLowerCase()}
                  </li>)}
                </ul>
              </div>}
            </li>)}
          </ol>
          {lifecycle.stages.some(stage => ['PLAN_PRODUCTION', 'EXECUTE_PRODUCTION'].includes(stage.action)) && order.instances?.some(instance => instance.tasks?.some((task: any) => Array.isArray(task.resourceBookings))) && <section className="page-stack border-t border-line pt-4" aria-label="Production schedule linked to this lifecycle">
            <div><h3 className="text-sm font-semibold text-ink">Production schedule</h3><p className="field-help">Live tasks and confirmed bookings from Planning; this lifecycle does not keep a separate schedule.</p></div>
            {order.instances?.flatMap(instance => instance.tasks ?? []).length ? <ul className="divide-y divide-line">
              {order.instances?.flatMap(instance => instance.tasks ?? []).map((task: any) => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><Link href={`/planning/tasks/${encodeURIComponent(task.id)}`} className="font-medium text-primary underline">{task.nodeKey}</Link><span className="ml-2 muted">{task.status.replaceAll('_', ' ').toLowerCase()}</span>{task.assignedTechnician?.name && <span className="ml-2 muted">· {task.assignedTechnician.name}</span>}{task.assignedMachine?.name && <span className="ml-2 muted">· {task.assignedMachine.name}</span>}</div>
                <div className="text-right small muted">{task.resourceBookings?.length ? task.resourceBookings.map((booking: any) => <div key={booking.id}>{booking.resourceType === 'MACHINE' ? task.assignedMachine?.name ?? 'Machine' : task.assignedTechnician?.name ?? 'Technician'} · {formatDateTime(booking.startAt)} – {formatDateTime(booking.endAt)}</div>) : 'No confirmed booking'}</div>
              </li>)}
            </ul> : <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm muted">Production tasks appear here after engineering releases the order. Planning creates and revalidates their bookings.</p>}
          </section>}
          {lifecycle.events.length > 0 && <div className="page-stack border-t border-line pt-4">
            <div><h3 className="text-sm font-semibold text-ink">Workflow handoff history</h3><p className="field-help">Recorded stage changes from the lifecycle event log.</p></div>
            <ol className="divide-y divide-line">
              {lifecycle.events.map((event) => {
                const stage = lifecycle.stages.find(candidate => candidate.id === event.stageId);
                let detail: { action?: string; completionFact?: string } = {};
                try { detail = JSON.parse(event.detailJson || '{}') as typeof detail; } catch { /* Historical event detail may predate structured lifecycle facts. */ }
                const completionFactLabels: Record<string, string> = {
                  ORDER_CONFIRMED: 'Order confirmed', ENGINEERING_APPROVED: 'Engineering approved',
                  SCHEDULE_PROPOSAL_APPLIED: 'Planning schedule applied', ALL_PRODUCTION_TASKS_COMPLETED: 'Production completed',
                  ALL_QC_INSPECTIONS_FINALIZED: 'Quality inspections finalized', ALL_SHIPMENT_QUANTITIES_DELIVERED: 'All quantities delivered',
                  EVIDENCE_REVIEWED: 'Evidence reviewed',
                };
                return <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-ink">{stage?.name ?? 'Workflow started'} · {event.eventType.replaceAll('_', ' ').toLowerCase()}{detail.action && <span className="ml-2 font-normal text-muted">· {detail.action.replaceAll('_', ' ').toLowerCase()}</span>}{detail.completionFact && <span className="ml-2 font-normal text-muted">· {completionFactLabels[detail.completionFact] ?? detail.completionFact.replaceAll('_', ' ').toLowerCase()}</span>}</span>
                  <span className="muted">{event.actorName ? `${event.actorName} · ` : ''}{event.fromState && event.toState ? `${event.fromState.replaceAll('_', ' ')} → ${event.toState.replaceAll('_', ' ')} · ` : ''}{formatDateTime(event.occurredAt)}</span>
                </li>;
              })}
            </ol>
          </div>}
        </Panel>;
      })()}

      <PermissionGate permission={['order.read', 'traceability.read', 'admin.access']}>
        <OrderEvidenceTimeline orderId={order.id} />
      </PermissionGate>

      {/* 4 Harmonized Metric Tiles */}
      {order.lines && order.lines.length > 1 && <Panel className="p-5 page-stack">
        <div><h2 className="text-sm font-semibold text-ink">Order lines</h2><p className="field-help">Each line has its own engineering revision and manufacturing jobs.</p></div>
        <div className="page-stack">
          {order.lines.map(line => <div key={line.id} className="order-detail-line">
            <div><strong>{line.item?.code || line.itemId} · {line.item?.name || 'Item'}</strong>{(() => { const revision = order.engineeringRevisions?.find(candidate => candidate.orderLineId === line.id); return revision ? <Link className="small text-primary underline" href={`/engineering/orders/${order.id}?revisionId=${revision.id}`}>Line {line.lineNumber} · Engineering {revision.status}</Link> : <span className="small muted">Line {line.lineNumber} · Engineering pending</span>; })()}<PermissionGate permission={['planning.read', 'execution.read']}><Link className="small ml-2 text-primary underline" href={memoryHrefForItem(line.itemId, order.id) ?? '/ai/memory'}>Similar jobs</Link></PermissionGate></div>
            <div><span className="small muted">Ordered</span><strong>{formatQuantity(BigInt(line.orderedAtoms))} {line.item?.baseUom?.code || ''}</strong></div>
            <div><span className="small muted">Allocated</span><strong>{formatQuantity(BigInt(line.allocatedAtoms))}</strong></div>
            <div><span className="small muted">Jobs</span><strong>{line.manufacturingOrders?.length ?? 0}</strong></div>
          </div>)}
        </div>
      </Panel>}
      {/* Order summary facts */}
      <section className="od-facts" aria-label="Order summary">
        <div className="od-fact">
          <span className="od-fact-label"><Package className="w-3.5 h-3.5" /> Target item</span>
          <strong className="od-fact-value" title={order.item?.name}>{order.item?.name || '—'}</strong>
          <span className="od-fact-sub">{order.item?.code || '—'}</span>
          <PermissionGate permission={['planning.read', 'execution.read']}><Link className="od-fact-link" href={memoryHrefForItem(order.itemId, order.id) ?? '/ai/memory'}>Similar jobs for this item</Link></PermissionGate>
        </div>
        <div className="od-fact">
          <span className="od-fact-label"><Boxes className="w-3.5 h-3.5" /> Ordered quantity</span>
          <strong className="od-fact-value numeric">{formatQuantity(BigInt(order.orderedAtoms))} {order.item?.baseUom?.code || 'Units'}</strong>
          <span className="od-fact-sub">{order.lines?.length && order.lines.length > 1 ? `${order.lines.length} order lines` : 'Single line'}</span>
        </div>
        <div className="od-fact">
          <span className="od-fact-label"><Calendar className="w-3.5 h-3.5" /> Requested delivery</span>
          <strong className="od-fact-value">{formatDate(order.requestedDate)}</strong>
          <span className="od-fact-sub">Target customer date</span>
        </div>
        <div className="od-fact">
          <span className="od-fact-label"><Clock className="w-3.5 h-3.5" /> Committed date</span>
          <strong className="od-fact-value">{order.promisedDate ? formatDate(order.promisedDate) : 'Pending'}</strong>
          <span className="od-fact-sub">
            {order.customerAcknowledged ? 'Customer acknowledged' : order.promisedDate ? 'Awaiting customer review' : 'Pending schedule review'}
          </span>
        </div>
      </section>

      {/* Tabs Navigation */}
      <Tabs
        className="od-tabs"
        ariaLabel="Order detail sections"
        activeId={activeTab}
        onChange={setActiveTab}
        items={[
          {
            id: 'overview',
            label: 'Overview',
            icon: 'order',
          },
          {
            id: 'engineering',
            label: 'Engineering & BOM',
            icon: 'engineering',
            badge: latestEng ? latestEng.status : undefined,
            badgeVariant:
              latestEng?.status === 'APPROVED' ? ('success' as const) : ('default' as const),
          },
          {
            id: 'production',
            label: 'Production Tasks',
            icon: 'work',
            count: instance?.tasks?.length,
          },
          {
            id: 'materials',
            label: 'Materials & Demands',
            icon: 'inventory',
            count: order.demands?.length,
          },
          {
            id: 'costing',
            label: 'Job Costing & Variance',
            icon: 'chart',
          },
          {
            id: 'fulfillment',
            label: 'Fulfillment & Shipments',
            icon: 'delivery',
            count: order.shipments?.length,
          },
        ]}
      />

      {/* TAB 1: Overview */}
      {activeTab === 'overview' && (
        <div className="page-stack">
          <SubjectFormEvidence
            subjectType="ORDER"
            subjectId={order.id}
            title="Order specification forms"
            description="Review and submit required customer specifications before the order is released."
          />
          <div className="od-grid">
          <section className="od-card" aria-labelledby="od-rfq-title">
            <header className="od-card-head">
              <h2 id="od-rfq-title"><FileText className="w-4 h-4" /> RFQ intake &amp; commercial notes</h2>
              {order.rfqDrafts?.[0] && <Badge>Source: {order.rfqDrafts[0].sourceType}</Badge>}
            </header>
            {order.rfqDrafts && order.rfqDrafts.length > 0 ? (
              <div className="od-stack">
                {order.rfqDrafts.map((rfq) => (
                  <pre key={rfq.id} className="od-note">{rfq.rawText}</pre>
                ))}
              </div>
            ) : (
              <p className="od-empty">No raw RFQ source text attached.</p>
            )}
            <footer className="od-card-foot">
              <span>Created {formatDateTime(order.createdAt)}</span>
              <span>Revision v{order.version}</span>
            </footer>
          </section>

          <section className="od-card" aria-labelledby="od-q-title">
            <header className="od-card-head">
              <h2 id="od-q-title"><Building2 className="w-4 h-4" /> Customer questions</h2>
              <Badge variant={order.questions?.some((q) => q.status === 'OPEN') ? 'danger' : 'default'}>
                {order.questions?.filter((q) => q.status === 'OPEN').length || 0} open
              </Badge>
            </header>
            {order.questions && order.questions.length > 0 ? (
              <ul className="od-questions">
                {order.questions.map((q) => (
                  <li key={q.id} className="od-question">
                    <div className="od-question-head">
                      <strong>{q.question}</strong>
                      <Badge variant={q.status === 'OPEN' ? 'warning' : 'success'}>{q.status}</Badge>
                    </div>
                    {q.answer ? <p className="od-answer">{q.answer}</p> : <p className="od-empty">Awaiting response from team.</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="od-empty">No customer questions or clarifications logged for this order.</p>
            )}
            <form onSubmit={handleAddQuestion} className="od-inline-form">
              <label className="sr-only" htmlFor="od-new-question">Log question or customer note</label>
              <Input id="od-new-question" type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Log question or customer note…" />
              <Button type="submit" variant="primary" icon="plus" disabled={addQuestionMutation.isPending || !newQuestion.trim()}>
                {addQuestionMutation.isPending ? 'Adding…' : 'Add'}
              </Button>
            </form>
          </section>

          <PermissionGate permission="order.release">
            <section className="od-card od-span" aria-labelledby="od-doc-title">
              <header className="od-card-head">
                <div>
                  <h2 id="od-doc-title"><FileText className="w-4 h-4" /> Customer documents</h2>
                  <p className="od-sub">Files stay private unless you publish them to this order's customer portal.</p>
                </div>
              </header>
              <div className="od-upload">
                <Input type="file" accept="application/pdf,image/png,image/jpeg,text/csv,text/plain" onChange={(event) => setCustomerDocument(event.target.files?.[0] ?? null)} aria-label="Choose order document" />
                <label className="od-check">
                  <input type="checkbox" checked={publishDocumentToCustomer} onChange={(event) => setPublishDocumentToCustomer(event.target.checked)} />
                  <span>Publish to customer</span>
                </label>
                <Button variant="primary" icon="download" disabled={!customerDocument || documentUploadPending} onClick={handleOrderDocumentUpload}>
                  {documentUploadPending ? 'Uploading…' : 'Upload document'}
                </Button>
              </div>
              {documentUploadMessage && <p role="status" className="od-sub">{documentUploadMessage}</p>}
            </section>
          </PermissionGate>
          </div>
        </div>
      )}

      {/* TAB 2: Engineering & BOM */}
      {activeTab === 'engineering' && (
        <div className="od-panel rounded-xl border bg-white p-6 space-y-5 border-line shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-line">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-base text-ink">
                  Engineering Revision #{latestEng?.revisionNumber || 1}
                </h3>
                <Badge
                  variant={latestEng?.status === 'APPROVED' ? 'success' : 'warning'}
                >
                  {latestEng?.status || 'UNASSIGNED'}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-1">
                Output basis: 1 display unit ({latestEng?.outputBasisAtoms?.toString() || '1,000,000'} atoms) · Routing Version:{' '}
                {latestEng?.workflowVersionId ? 'Linked to Master Workflow' : 'Custom'}
              </p>
            </div>
            <ButtonLink href={`/engineering/orders/${order.id}`}>
              <span className="inline-flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Open Engineering Editor
              </span>
            </ButtonLink>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Reviewed Bill of Materials (BOM)
            </h4>
            {bomLines.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b bg-surface-muted text-muted font-semibold border-line">
                      <th className="p-3">Operation Node</th>
                      <th className="p-3">Component Item</th>
                      <th className="p-3">Item Code</th>
                      <th className="p-3">UOM</th>
                      <th className="p-3">Req / Unit</th>
                      <th className="p-3">Total Order Req</th>
                      <th className="p-3">Allowance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {bomLines.map((b: any) => {
                      const line = order.lines?.find(candidate => candidate.id === b.orderLineId);
                      const lineAtoms = BigInt(line?.orderedAtoms ?? order.orderedAtoms);
                      const reqPerUnit = formatQuantity(BigInt(b.requirementAtoms));
                      const totalReqAtoms = (BigInt(b.requirementAtoms) * lineAtoms) / BigInt(b.outputBasisAtoms);
                      const totalReq = formatQuantity(totalReqAtoms);
                      return (
                        <tr key={b.id} className="hover:bg-surface-muted/50">
                          <td className="p-3 font-mono font-bold text-primary">
                            {b.operationNodeKey}<span className="block text-[10px] font-normal text-muted">Rev {b.engineeringRevisionNumber} · {line ? `Line ${line.lineNumber}` : 'Order'}</span>
                          </td>
                          <td className="p-3 font-medium text-ink">
                            {b.item?.name || b.itemId}
                          </td>
                          <td className="p-3 font-mono text-muted">
                            {b.item?.code || '—'}
                          </td>
                          <td className="p-3">{b.inputUom?.code || b.inputUomId}</td>
                          <td className="p-3 font-semibold text-ink">{reqPerUnit}</td>
                          <td className="p-3 font-bold text-primary">
                            {totalReq.toLocaleString()} {b.inputUom?.code}
                          </td>
                          <td className="p-3 text-muted">{b.allowancePercent}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted py-4">
                No BOM lines attached to this engineering revision.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Production Tasks */}
      {activeTab === 'production' && (
        <div className="od-panel rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-line">
            <div>
              <h3 className="font-semibold text-sm text-ink">
                Production Execution Tasks
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Directed Acyclic Graph (DAG) instantiated from reviewed workflow.
              </p>
            </div>
            {instance && (
              <Badge variant={instance.status === 'COMPLETED' ? 'success' : 'blue'}>
                Instance: {instance.status}
              </Badge>
            )}
          </div>

          {instance && instance.tasks && instance.tasks.length > 0 ? (
            <div className="space-y-3">
              {instance.tasks.map((task: any) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-4 border rounded-xl p-4 text-sm border-line bg-surface hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-primary text-base">
                        {task.nodeKey}
                      </span>
                      <Badge
                        variant={
                          task.status === 'COMPLETED'
                            ? 'success'
                            : task.status === 'IN_PROGRESS' || task.status === 'READY'
                            ? 'blue'
                            : 'default'
                        }
                      >
                        {task.status}
                      </Badge>
                      <span className="text-xs text-muted">
                        Planned: {task.plannedDurationMinutes} mins
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted pt-1">
                      {task.assignedTechnician && (
                        <span className="inline-flex items-center gap-1 bg-surface-muted border border-line px-2 py-0.5 rounded">
                          <User className="w-3 h-3 text-muted" />
                          Tech: <strong>{task.assignedTechnician.name}</strong>
                        </span>
                      )}
                      {task.assignedMachine && (
                        <span className="inline-flex items-center gap-1 bg-surface-muted border border-line px-2 py-0.5 rounded">
                          <Cog className="w-3 h-3 text-muted" />
                          Station: <strong>{task.assignedMachine.name}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ButtonLink href={`/planning/tasks/${task.id}`}>
                      View Task Details
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted space-y-2">
              <Layers className="w-8 h-8 mx-auto text-muted/50" />
              <p className="text-sm font-medium text-ink">
                Order has not been released to production yet.
              </p>
              <p className="text-xs text-muted max-w-md mx-auto">
                Approve engineering review and click &ldquo;Release to production&rdquo;
                to instantiate the execution task DAG on the shop floor.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Materials & Demands */}
      {activeTab === 'materials' && (
        <div className="od-panel rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
          <div className="border-b pb-3 border-line">
            <h3 className="font-semibold text-sm text-ink">
              Material Demand Requirements
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Demands calculated from reviewed BOM basis and target order quantity.
            </p>
          </div>

          {order.demands && order.demands.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-surface-muted text-muted font-semibold border-line">
                    <th className="p-3">Required Component</th>
                    <th className="p-3">Item Code</th>
                    <th className="p-3">Required Quantity</th>
                    <th className="p-3">Need By Date</th>
                    <th className="p-3">Demand Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {order.demands.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-muted/50">
                      <td className="p-3 font-semibold text-ink">
                        {d.item?.name || d.itemId}
                      </td>
                      <td className="p-3 font-mono text-muted">
                        {d.item?.code || '—'}
                      </td>
                      <td className="p-3 font-bold text-primary">
                        {formatQuantity(BigInt(d.requiredAtoms))}{' '}
                        {d.item?.baseUom?.code || 'units'}
                      </td>
                      <td className="p-3 text-muted">{formatDate(d.needByDate)}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            d.status === 'ISSUED'
                              ? 'success'
                              : d.status === 'ALLOCATED'
                              ? 'blue'
                              : 'warning'
                          }
                        >
                          {d.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted space-y-1">
              <p className="text-sm font-medium text-ink">
                No active material demands registered yet.
              </p>
              <p className="text-xs">
                Material demand automatically calculates and posts upon order release.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Fulfillment & Shipments */}
      {activeTab === 'costing' && (
        <div className="od-panel rounded-xl border bg-white p-6 border-line shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-line">
            <div>
              <h3 className="font-semibold text-sm text-ink">
                Job Cost Ledger & Financial Variance
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Standard baseline budget vs authoritative actual incurred expenditure in 64-bit integer minor units.
              </p>
            </div>
            <PermissionGate permission="cost.manage">
              <Button variant="primary" onClick={() => setShowCostModal(true)} icon="plus">Record Cost Entry</Button>
            </PermissionGate>
          </div>

          {costingQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-muted">
              Calculating job costing ledger balances...
            </div>
          ) : costingQuery.error ? (
            <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert">
              Cost comparison is unavailable: {costingQuery.error.message}
            </div>
          ) : costingQuery.data ? (
            <div className="space-y-6">
              {!costingQuery.data.hasEntries && <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm text-muted">No cost entries are recorded. Missing cost data is shown as unavailable, not as zero.</p>}
              {/* Cost Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Standard Budget
                  </span>
                  <div className="text-2xl font-bold font-mono text-ink mt-1">
                    {formatCents(costingQuery.data.totalStandardCents, costingQuery.data.currency)}
                  </div>
                  <p className="text-xs text-muted mt-1">{costingQuery.data.hasStandard ? 'Recorded target baseline' : 'No standard cost recorded'}</p>
                </div>

                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Actual Incurred Cost
                  </span>
                  <div className="text-2xl font-bold font-mono text-ink mt-1">
                    {formatCents(costingQuery.data.totalActualCents, costingQuery.data.currency)}
                  </div>
                  <p className="text-xs text-muted mt-1">{costingQuery.data.hasActual ? 'Recorded actual entries' : 'No actual cost recorded'}</p>
                </div>

                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Cost Variance
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${costingQuery.data.isFavorable === null ? 'text-muted' : costingQuery.data.isFavorable ? "text-success" : "text-danger"}`}>
                      {formatCents(costingQuery.data.totalVarianceCents, costingQuery.data.currency)}
                    </span>
                    <Badge variant={costingQuery.data.isFavorable === null ? 'warning' : costingQuery.data.isFavorable ? "success" : "danger"}>
                      {costingQuery.data.isFavorable === null ? 'INCOMPLETE' : costingQuery.data.isFavorable ? "FAVORABLE" : "UNFAVORABLE"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {costingQuery.data.isFavorable === null ? 'Both standard and actual entries are required for a variance.' : costingQuery.data.isFavorable ? "Actual below standard budget" : "Budget overrun detected"}
                  </p>
                </div>
              </div>

              <div>
                <Button variant="soft" onClick={() => void toggleCostExplanation()} disabled={!costingQuery.data.hasEntries || costExplanationPending}>
                  {showCostExplanation ? 'Hide variance explanation' : 'Explain variance'}
                </Button>
                {showCostExplanation && (
                  <div className="mt-3 rounded-lg border border-line bg-surface-muted p-4 text-sm" role="status">
                    <h4 className="font-semibold text-ink">Evidence-based cost variance</h4>
                    {costExplanationPending && <p className="mt-1 text-muted">Loading ranked cost evidence…</p>}
                    {costExplanationError && <p className="mt-1 text-danger" role="alert">{costExplanationError}</p>}
                    {costExplanation && costExplanation.totalVarianceCents === null ? (
                      <p className="mt-1 text-muted">{costExplanation.unavailableReason} Standard coverage: {costExplanation.coverage.standard ? 'available' : 'missing'}; actual coverage: {costExplanation.coverage.actual ? 'available' : 'missing'}.</p>
                    ) : costExplanation ? (
                      <>
                        <p className="mt-1 text-muted">Variance is actual cost minus standard budget. Positive values are over budget; negative values are below budget. This view does not estimate revenue or margin.</p>
                        <ol className="mt-3 list-decimal space-y-1 pl-5">
                          {costExplanation.contributors.map(category => (
                              <li key={category.category}>
                                <span className="font-medium text-ink">{category.category}</span>: {formatCents(category.varianceCents, costExplanation.currency)} variance from {category.sourceEntryCount} recorded source {category.sourceEntryCount === 1 ? 'entry' : 'entries'}. <Link href={category.evidenceHref} className="text-primary underline">Review cost evidence</Link>
                              </li>
                            ))}
                        </ol>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Categories Variance Table */}
              <div className="overflow-x-auto border border-line rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-surface text-muted font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Cost Category</th>
                      <th className="py-3 px-4 font-mono">Standard Budget</th>
                      <th className="py-3 px-4 font-mono">Actual Incurred</th>
                      <th className="py-3 px-4 font-mono">Variance</th>
                      <th className="py-3 px-4 text-right">Performance</th>
                      <th className="py-3 px-4">Source entries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink">
                    {costingQuery.data.categories.map((cat) => (
                      <tr key={cat.category} className="hover:bg-surface-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-ink">
                          {cat.category}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted">
                          {formatCents(cat.standardCents, costingQuery.data.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-ink">
                          {formatCents(cat.actualCents, costingQuery.data.currency)}
                        </td>
                        <td className={`py-3 px-4 font-mono font-semibold ${cat.isFavorable === null ? 'text-muted' : cat.isFavorable ? "text-success" : "text-danger"}`}>
                          {formatCents(cat.varianceCents, costingQuery.data.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant={cat.isFavorable === null ? 'warning' : cat.isFavorable ? "success" : "danger"}>
                            {cat.isFavorable === null ? 'INCOMPLETE' : cat.isFavorable ? "FAVORABLE" : "UNFAVORABLE"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {cat.entries.length ? <details><summary className="cursor-pointer text-primary">{cat.entries.length} source entries</summary><ul className="mt-2 space-y-1">{cat.entries.map(entry => <li key={entry.id} className="small">{entry.costType} · {formatCents(entry.amountCents, costingQuery.data.currency)}{entry.taskId ? <> · <Link href={`/planning/tasks/${encodeURIComponent(entry.taskId)}`} className="text-primary underline">Task</Link></> : null}{entry.notes ? ` · ${entry.notes}` : ''}</li>)}</ul></details> : <span className="small muted">No source entries</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted">
              No cost entries recorded for this order yet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'fulfillment' && (
        <div className="od-panel rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-line">
            <div>
              <h3 className="font-semibold text-sm text-ink">
                Consignments & Delivery Evidence
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Physical shipments, customer receipt confirmations, and proof of delivery.
              </p>
            </div>
          </div>

          {order.shipments && order.shipments.length > 0 ? (
            <div className="space-y-4">
              {order.shipments.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-line p-5 space-y-3 bg-surface hover:border-primary/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div className="flex items-center gap-3">
                      <Truck className="w-4 h-4 text-primary" />
                      <span className="font-mono font-bold text-base text-ink">
                        {s.shipmentNumber}
                      </span>
                      <Badge
                        variant={
                          s.status === 'DELIVERED'
                            ? 'success'
                            : s.status === 'DISPATCHED'
                            ? 'blue'
                            : 'warning'
                        }
                      >
                        {s.status}
                      </Badge>
                    </div>

                    <ButtonLink href={`/delivery/shipments/${s.id}`}>
                      View Shipment & Packing Slip
                    </ButtonLink>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted block">Carrier / Logistics</span>
                      <strong className="text-ink font-semibold">
                        {s.carrierName || 'Direct Logistics'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted block">Waybill / Tracking</span>
                      <span className="font-mono text-ink">
                        {s.trackingNumber || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block">Proof of Delivery (POD)</span>
                      <span className="font-mono text-ink font-semibold">
                        {s.proofOfDelivery || 'Pending'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block">Delivered At</span>
                      <span className="text-ink">
                        {s.deliveredAt ? formatDateTime(s.deliveredAt) : 'In Transit'}
                      </span>
                    </div>
                  </div>

                  {s.destinationAddress && (
                    <div className="text-xs text-muted bg-surface-muted p-2.5 rounded border border-line">
                      Destination Address: <strong className="text-ink">{s.destinationAddress}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted space-y-1">
              <Truck className="w-8 h-8 mx-auto text-muted/50" />
              <p className="text-sm font-medium text-ink">
                No shipments created yet for this order.
              </p>
              <p className="text-xs">
                Finished stock will be reserved and allocated for shipment once production completes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Record Cost Entry Modal */}
      {showCostModal && (
        <Dialog
          isOpen
          onClose={() => setShowCostModal(false)}
          title="Record Job Cost Entry"
          size="md"
          pending={recordCostMutation.isPending}
        >
          <form onSubmit={handleRecordCost} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Cost Category
              </label>
              <Select
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="MATERIAL">Material Cost</option>
                <option value="LABOR">Direct Labor</option>
                <option value="MACHINE">Machine Telemetry / Run-hour</option>
                <option value="OUTSOURCED">Subcontractor / External Processing</option>
                <option value="SCRAP">Scrap / Defect Loss</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Entry Type
              </label>
              <Select
                value={costType}
                onChange={(e) => setCostType(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="ACTUAL">Actual Incurred Cost</option>
                <option value="STANDARD">Standard Baseline Budget</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Amount ({costCurrency}, two decimal places)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={costAmountDollars}
                onChange={(e) => setCostAmountDollars(e.target.value)}
                placeholder="e.g. 245.50"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Currency</label>
              <Select value={costCurrency} onChange={event => setCostCurrency(event.target.value)}>
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </Select>
              <p className="small muted mt-1">All entries for one order must use the same currency.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Cost Rationale / Ledger Notes
              </label>
              <Textarea
                value={costNotes}
                onChange={(e) => setCostNotes(e.target.value)}
                placeholder="Reference PO, technician shift sheet, or machine telemetry log..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowCostModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={recordCostMutation.isPending}
              >
                {recordCostMutation.isPending ? "Recording..." : "Post to Ledger"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Order Change Request Modal */}
      {showChangeModal && (
        <Dialog
          isOpen
          onClose={() => setShowChangeModal(false)}
          title="Submit Order Change Request (OCR)"
          size="md"
          pending={changeRequestMutation.isPending}
        >
          <form onSubmit={handleChangeRequestSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Change Classification
              </label>
              <Select
                value={changeType}
                onChange={(e) => setChangeType(e.target.value)}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              >
                <option value="DELIVERY_DATE">Delivery Date Rescheduling</option>
                <option value="QUANTITY">Quantity Variation</option>
                <option value="SPECIFICATION">BOM / Specification Revision</option>
                <option value="CANCEL">Order Cancellation</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Requested Target Adjustment
              </label>
              <Input
                type="text"
                required
                value={requestedValue}
                onChange={(e) => setRequestedValue(e.target.value)}
                placeholder="e.g. New delivery target 2026-11-01 or +20 units"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Business Reason & Customer Confirmation
              </label>
              <Textarea
                required
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Formal reason, customer reference correspondence, or supply disruption note..."
                rows={3}
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowChangeModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={changeRequestMutation.isPending}
              >
                {changeRequestMutation.isPending ? "Submitting..." : "Submit Change Request"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {showConfirmModal && <Dialog
        isOpen
        onClose={() => setShowConfirmModal(false)}
        title="Confirm customer order?"
        subtitle="This records the customer order as confirmed. Check every line and approved engineering revision before continuing."
        size="sm"
        pending={confirmMutation.isPending}
        footer={<><Button onClick={() => setShowConfirmModal(false)} disabled={confirmMutation.isPending}>Cancel</Button><Button variant="primary" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate(undefined, { onSuccess: () => setShowConfirmModal(false) })}>{confirmMutation.isPending ? 'Confirming…' : 'Confirm order'}</Button></>}
      >
        <div className="page-stack"><p className="text-sm text-ink">{order.lines?.length ?? 1} order line(s) will be included in the confirmed request.</p><p className="small muted">After confirmation, line items can no longer be edited or allocated as draft jobs.</p></div>
      </Dialog>}

    </div>
  );
}
