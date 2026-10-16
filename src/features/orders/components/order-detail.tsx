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
import { formatQuantity } from '@/domain/quantity';
import { apiRequest } from '@/lib/api/client';
import { PermissionGate } from '@/components/ui/permission-gate';

interface OrderDetailProps {
  order: OrderDto;
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

function formatCents(centsStr?: string | bigint | number): string {
  if (centsStr === undefined || centsStr === null) return "$0.00";
  const cents = typeof centsStr === "bigint" ? Number(centsStr) : Number(centsStr);
  const dollars = (cents / 100).toFixed(2);
  return "$" + Number(dollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [costNotes, setCostNotes] = useState("");

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
    const dollars = parseFloat(costAmountDollars);
    if (isNaN(dollars) || dollars < 0) return;
    const amountCents = Math.round(dollars * 100);
    await recordCostMutation.mutateAsync({
      costCategory,
      costType,
      amountCents,
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
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={
          <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
            <span>
              Customer:{' '}
              <strong className="text-ink font-semibold">
                {order.customer?.name || '—'}
              </strong>{' '}
              ({order.customer?.code || '—'})
            </span>
            <span className="text-line">•</span>
            <span>
              Type:{' '}
              <strong className="text-ink font-semibold">
                {order.orderType?.name || 'Standard'}
              </strong>
            </span>
            <span className="text-line">•</span>
            <Badge variant={getStatusVariant(order.status)}>
              {order.status}
            </Badge>
            {order.customerAcknowledged && (
              <Badge variant="success">Customer Acknowledged</Badge>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/orders">
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Orders
              </span>
            </ButtonLink>

            {latestEng && (
              <ButtonLink href={`/engineering/orders/${order.id}`}>
                <span className="inline-flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" />
                  Engineering Spec ({latestEng.status})
                </span>
              </ButtonLink>
            )}

            {latestShipment && (
              <ButtonLink href={`/delivery/shipments/${latestShipment.id}`}>
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  Consignment #{latestShipment.shipmentNumber}
                </span>
              </ButtonLink>
            )}

            {canConfirm && <Button variant="primary" onClick={() => setShowConfirmModal(true)} disabled={confirmMutation.isPending}>
              Confirm order
            </Button>}

            {canRelease && (
              <Button
                variant="primary"
                onClick={handleRelease}
                disabled={releaseMutation.isPending}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  {releaseMutation.isPending
                    ? 'Releasing…'
                    : 'Release to Production'}
                </span>
              </Button>
            )}
          </div>
        }
      />

      {/* Contextual Lifecycle Status Banner */}
      {isDelivered && (
        <div className="px-6 py-3.5 bg-emerald-50/70 border border-emerald-200/70 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-success shrink-0">
              <Check className="w-4 h-4 text-success stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-bold text-ink flex items-center gap-2">
                Order Delivered & Customer Fulfilled
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                {latestShipment?.receivedBy ? (
                  <>
                    Received by{' '}
                    <strong className="text-ink font-semibold">
                      {latestShipment.receivedBy}
                    </strong>
                    {latestShipment.deliveredAt &&
                      ` on ${formatDateTime(latestShipment.deliveredAt)}`}
                  </>
                ) : (
                  'Finished goods verified and received at customer destination.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {latestShipment?.proofOfDelivery && (
              <span className="text-xs font-mono text-ink bg-white px-2.5 py-1 rounded border border-emerald-200 shadow-2xs">
                POD: {latestShipment.proofOfDelivery}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-white border border-emerald-200 px-2.5 py-1 rounded-full shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Ledger Settled
            </span>
          </div>
        </div>
      )}

      {order.status === 'IN_PRODUCTION' && (
        <div className="px-6 py-3.5 bg-blue-50/70 border border-blue-200/70 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <div>
              <div className="text-xs font-bold text-ink">
                Order Active in Shop Floor Production
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                Task DAG running. Material reservations locked and operations in progress.
              </p>
            </div>
          </div>
          <ButtonLink href="/planning">View Shop Floor Planning</ButtonLink>
        </div>
      )}

      {order.status === 'READY' && (
        <div className="px-6 py-3.5 bg-blue-50/70 border border-blue-200/70 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-primary shrink-0">
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-xs font-bold text-ink">
                Engineering Review Approved · Ready for Release
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                BOM and process routings are locked. Click release to schedule operations and register supply demand.
              </p>
            </div>
          </div>
          {canConfirm ? <Button variant="primary" onClick={() => setShowConfirmModal(true)}>Confirm order</Button> : canRelease && <Button variant="primary" onClick={handleRelease} disabled={releaseMutation.isPending}>Release to production</Button>}
        </div>
      )}

      {order.confirmedAt && <Panel className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div><strong className="text-sm text-ink">Order confirmed</strong><p className="small muted">Confirmed {formatDateTime(order.confirmedAt)}. Engineering release can now create the manufacturing jobs.</p></div>
        {canRelease && <Button variant="primary" onClick={handleRelease} disabled={releaseMutation.isPending}>{releaseMutation.isPending ? 'Releasing…' : 'Release to production'}</Button>}
      </Panel>}

      {/* 4 Harmonized Metric Tiles */}
      {order.lines && order.lines.length > 1 && <Panel className="p-5 page-stack">
        <div><h2 className="text-sm font-semibold text-ink">Order lines</h2><p className="field-help">Each line has its own engineering revision and manufacturing jobs.</p></div>
        <div className="page-stack">
          {order.lines.map(line => <div key={line.id} className="order-detail-line">
            <div><strong>{line.item?.code || line.itemId} · {line.item?.name || 'Item'}</strong>{(() => { const revision = order.engineeringRevisions?.find(candidate => candidate.orderLineId === line.id); return revision ? <Link className="small text-primary underline" href={`/engineering/orders/${order.id}?revisionId=${revision.id}`}>Line {line.lineNumber} · Engineering {revision.status}</Link> : <span className="small muted">Line {line.lineNumber} · Engineering pending</span>; })()}</div>
            <div><span className="small muted">Ordered</span><strong>{formatQuantity(BigInt(line.orderedAtoms))} {line.item?.baseUom?.code || ''}</strong></div>
            <div><span className="small muted">Allocated</span><strong>{formatQuantity(BigInt(line.allocatedAtoms))}</strong></div>
            <div><span className="small muted">Jobs</span><strong>{line.manufacturingOrders?.length ?? 0}</strong></div>
          </div>)}
        </div>
      </Panel>}
      <Panel className="p-0 overflow-hidden shadow-xs border-line">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line bg-surface">
          {/* Tile 1: Target Item */}
          <div className="p-5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Package className="w-3.5 h-3.5 text-muted" />
              Target Item
            </div>
            <div>
              <p className="text-base font-bold text-ink truncate" title={order.item?.name}>
                {order.item?.name || '—'}
              </p>
              <p className="text-xs text-muted font-mono mt-0.5">
                {order.item?.code || '—'}
              </p>
            </div>
          </div>

          {/* Tile 2: Ordered Quantity */}
          <div className="p-5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Boxes className="w-3.5 h-3.5 text-muted" />
              Ordered Quantity
            </div>
            <div>
              <p className="text-base font-bold text-ink">
                {formatQuantity(BigInt(order.orderedAtoms))} {order.item?.baseUom?.code || 'Units'}
              </p>
              <p className="text-xs text-muted font-mono mt-0.5">
                {formatQuantity(BigInt(order.orderedAtoms))} display units
              </p>
            </div>
          </div>

          {/* Tile 3: Requested Delivery */}
          <div className="p-5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Calendar className="w-3.5 h-3.5 text-muted" />
              Requested Delivery
            </div>
            <div>
              <p className="text-base font-bold text-ink">
                {formatDate(order.requestedDate)}
              </p>
              <p className="text-xs text-muted mt-0.5">Target customer date</p>
            </div>
          </div>

          {/* Tile 4: Committed Delivery */}
          <div className="p-5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-muted" />
              Committed Date
            </div>
            <div>
              <p className="text-base font-bold text-ink">
                {order.promisedDate ? formatDate(order.promisedDate) : 'Pending Confirmation'}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {order.customerAcknowledged
                  ? '✓ Customer acknowledged'
                  : order.promisedDate
                  ? 'Awaiting customer review'
                  : 'Pending schedule review'}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Tabs Navigation */}
      <div className="border-b border-line flex items-center gap-6 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          {
            id: 'engineering',
            label: 'Engineering & BOM',
            badge: latestEng ? latestEng.status : undefined,
            badgeVariant:
              latestEng?.status === 'APPROVED' ? ('success' as const) : ('default' as const),
          },
          {
            id: 'production',
            label: 'Production Tasks',
            badge: instance?.tasks?.length ? `${instance.tasks.length}` : undefined,
          },
          {
            id: 'materials',
            label: 'Materials & Demands',
            badge: order.demands?.length ? `${order.demands.length}` : undefined,
          },
          {
            id: 'costing',
            label: 'Job Costing & Variance',
          },
          {
            id: 'fulfillment',
            label: 'Fulfillment & Shipments',
            badge: order.shipments?.length ? `${order.shipments.length}` : undefined,
            badgeVariant: isDelivered ? ('success' as const) : ('blue' as const),
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 pt-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink hover:border-line'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <Badge
                  variant={tab.badgeVariant || (isActive ? 'blue' : 'default')}
                  className="text-xs px-1.5 py-0"
                >
                  {tab.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* RFQ Intake */}
          <div className="rounded-xl border bg-white p-5 space-y-4 border-line shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                RFQ Intake & Commercial Notes
              </h3>
              {order.rfqDrafts?.[0] && (
                <span className="text-xs font-mono bg-surface-muted text-muted px-2 py-0.5 rounded border border-line">
                  Source: {order.rfqDrafts[0].sourceType}
                </span>
              )}
            </div>

            {order.rfqDrafts && order.rfqDrafts.length > 0 ? (
              <div className="space-y-3">
                {order.rfqDrafts.map((rfq) => (
                  <div
                    key={rfq.id}
                    className="rounded-lg border bg-surface-muted p-4 text-xs font-mono text-ink leading-relaxed border-line"
                  >
                    <p className="whitespace-pre-wrap">{rfq.rawText}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No raw RFQ source text attached.</p>
            )}

            <div className="pt-3 border-t border-line text-xs text-muted flex flex-wrap justify-between gap-2">
              <span>Order Created: {formatDateTime(order.createdAt)}</span>
              <span>Revision Version: {order.version}</span>
            </div>
          </div>

          {/* Customer Questions */}
          <div className="rounded-xl border bg-white p-5 space-y-4 border-line shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted" />
                Customer Questions & Clarifications
              </h3>
              <Badge
                variant={
                  order.questions?.some((q) => q.status === 'OPEN')
                    ? 'danger'
                    : 'default'
                }
              >
                {order.questions?.filter((q) => q.status === 'OPEN').length || 0} Open
              </Badge>
            </div>

            {order.questions && order.questions.length > 0 ? (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {order.questions.map((q) => (
                  <div
                    key={q.id}
                    className="rounded-lg border p-3 text-xs space-y-1.5 border-line bg-surface-muted"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <strong className="text-ink font-medium">{q.question}</strong>
                      <Badge
                        variant={q.status === 'OPEN' ? 'warning' : 'success'}
                        className="text-xs"
                      >
                        {q.status}
                      </Badge>
                    </div>
                    {q.answer ? (
                      <p className="text-muted border-l-2 border-primary pl-2 italic mt-1">
                        Ans: {q.answer}
                      </p>
                    ) : (
                      <p className="text-xs text-muted italic">Awaiting response from team.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted py-2">
                No customer questions or clarifications logged for this order.
              </p>
            )}

            <form
              onSubmit={handleAddQuestion}
              className="pt-3 border-t border-line flex gap-2"
            >
              <Input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Log question or customer note…"
                className="flex-1 text-xs"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={addQuestionMutation.isPending || !newQuestion.trim()}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </form>
          </div>

          <PermissionGate permission="order.release">
            <Panel className="md:col-span-2 space-y-3">
              <div>
                <h3 className="font-semibold text-sm text-ink">Customer Document Publishing</h3>
                <p className="text-xs text-muted">Keep the file private or explicitly publish it to this order's customer portal.</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Input type="file" accept="application/pdf,image/png,image/jpeg,text/csv,text/plain" onChange={(event) => setCustomerDocument(event.target.files?.[0] ?? null)} aria-label="Choose order document" />
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={publishDocumentToCustomer} onChange={(event) => setPublishDocumentToCustomer(event.target.checked)} />
                  Publish to customer
                </label>
                <Button variant="primary" disabled={!customerDocument || documentUploadPending} onClick={handleOrderDocumentUpload}>
                  {documentUploadPending ? 'Uploading…' : 'Upload document'}
                </Button>
              </div>
              {documentUploadMessage && <p role="status" className="text-xs text-muted">{documentUploadMessage}</p>}
            </Panel>
          </PermissionGate>
        </div>
      )}

      {/* TAB 2: Engineering & BOM */}
      {activeTab === 'engineering' && (
        <div className="rounded-xl border bg-white p-6 space-y-5 border-line shadow-2xs">
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
        <div className="rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
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
        <div className="rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
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
        <div className="rounded-xl border bg-white p-6 border-line shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-line">
            <div>
              <h3 className="font-semibold text-sm text-ink">
                Job Cost Ledger & Financial Variance
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Standard baseline budget vs authoritative actual incurred expenditure in 64-bit integer minor units.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCostModal(true)}
              icon="plus"
            >
              Record Cost Entry
            </Button>
          </div>

          {costingQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-muted">
              Calculating job costing ledger balances...
            </div>
          ) : costingQuery.data ? (
            <div className="space-y-6">
              {/* Cost Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Standard Budget
                  </span>
                  <div className="text-2xl font-bold font-mono text-ink mt-1">
                    {formatCents(costingQuery.data.totalStandardCents)}
                  </div>
                  <p className="text-xs text-muted mt-1">Target baseline allocation</p>
                </div>

                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Actual Incurred Cost
                  </span>
                  <div className="text-2xl font-bold font-mono text-ink mt-1">
                    {formatCents(costingQuery.data.totalActualCents)}
                  </div>
                  <p className="text-xs text-muted mt-1">Booked production expenses</p>
                </div>

                <div className="p-4 bg-surface rounded-xl border border-line">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Cost Variance
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold font-mono ${costingQuery.data.isFavorable ? "text-success" : "text-danger"}`}>
                      {formatCents(costingQuery.data.totalVarianceCents)}
                    </span>
                    <Badge variant={costingQuery.data.isFavorable ? "success" : "danger"}>
                      {costingQuery.data.isFavorable ? "FAVORABLE" : "UNFAVORABLE"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {costingQuery.data.isFavorable ? "Actual below standard budget" : "Budget overrun detected"}
                  </p>
                </div>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink">
                    {costingQuery.data.categories.map((cat) => (
                      <tr key={cat.category} className="hover:bg-surface-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-ink">
                          {cat.category}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted">
                          {formatCents(cat.standardCents)}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-ink">
                          {formatCents(cat.actualCents)}
                        </td>
                        <td className={`py-3 px-4 font-mono font-semibold ${cat.isFavorable ? "text-success" : "text-danger"}`}>
                          {formatCents(cat.varianceCents)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant={cat.isFavorable ? "success" : "danger"}>
                            {cat.isFavorable ? "FAVORABLE" : "UNFAVORABLE"}
                          </Badge>
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
        <div className="rounded-xl border bg-white p-6 border-line shadow-2xs space-y-4">
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
                Amount (USD $)
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
