'use client';

import { Input } from '@/components/ui/input';
import React, { useState } from 'react';
import Link from 'next/link';
import { OrderDto } from '../api';
import { useReleaseOrder, useAddCustomerQuestion } from '../hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface OrderDetailProps {
  order: OrderDto;
}

export function OrderDetail({ order }: OrderDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'engineering' | 'production' | 'materials'>('overview');
  const [newQuestion, setNewQuestion] = useState('');

  const releaseMutation = useReleaseOrder(order.id);
  const addQuestionMutation = useAddCustomerQuestion(order.id);

  const latestEng = order.engineeringRevisions?.[0];
  const instance = order.instances?.[0];
  const canRelease = order.status === 'READY' || (latestEng?.status === 'APPROVED' && order.status === 'DRAFT');

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    addQuestionMutation.mutate(newQuestion.trim(), {
      onSuccess: () => setNewQuestion(''),
    });
  };

  const handleRelease = () => {
    releaseMutation.mutate();
  };

  const naturalQuantity = Number(order.orderedAtoms) / 1_000_000;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-6 rounded-lg shadow-sm border-line">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-ink">{order.orderNumber}</h1>
            <Badge
              variant={
                order.status === 'RELEASED' || order.status === 'IN_PRODUCTION'
                  ? 'success'
                  : order.status === 'READY'
                  ? 'blue'
                  : 'default'
              }
            >
              {order.status}
            </Badge>
          </div>
          <p className="text-sm text-muted mt-1">
            Customer: <strong>{order.customer?.name}</strong> ({order.customer?.code}) · Type: {order.orderType?.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {latestEng && (
            <Link href={`/engineering/orders/${order.id}`} className="btn  ">
                Engineering spec ({latestEng.status})
              </Link>
          )}

          {canRelease && (
            <Button
              variant="primary"
              onClick={handleRelease}
              disabled={releaseMutation.isPending}
            >
              {releaseMutation.isPending ? 'Releasing…' : 'Release to production'}
            </Button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-white p-4 border-line">
          <span className="text-xs font-semibold text-muted uppercase">Target Item</span>
          <p className="text-base font-bold text-muted mt-1">{order.item?.name}</p>
          <span className="text-xs text-muted font-mono">{order.item?.code}</span>
        </div>

        <div className="rounded-lg border bg-white p-4 border-line">
          <span className="text-xs font-semibold text-muted uppercase">Ordered Quantity</span>
          <p className="text-base font-bold text-muted mt-1">
            {naturalQuantity} {order.item?.baseUom?.code || 'units'}
          </p>
          <span className="text-xs text-muted">{order.orderedAtoms.toString()} atoms</span>
        </div>

        <div className="rounded-lg border bg-white p-4 border-line">
          <span className="text-xs font-semibold text-muted uppercase">Requested Delivery</span>
          <p className="text-base font-bold text-muted mt-1">
            {new Date(order.requestedDate).toLocaleDateString()}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4 border-line">
          <span className="text-xs font-semibold text-muted uppercase">Committed Date</span>
          <p className="text-base font-bold text-muted mt-1">
            {order.promisedDate ? new Date(order.promisedDate).toLocaleDateString() : 'Pending confirmation'}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-line">
        <nav className="flex space-x-6">
          {(['overview', 'engineering', 'production', 'materials'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-semibold capitalize border-b-2 ${
                activeTab === tab
                  ? 'border-line text-primary'
                  : 'border-transparent text-muted hover:text-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* RFQ and Notes */}
          <div className="rounded-lg border bg-white p-5 space-y-4 border-line">
            <h3 className="font-semibold text-sm text-ink">RFQ Intake Source</h3>
            {order.rfqDrafts && order.rfqDrafts.length > 0 ? (
              <div className="space-y-3">
                {order.rfqDrafts.map((rfq) => (
                  <div key={rfq.id} className="rounded border bg-surface-muted p-3 text-xs font-mono border-line">
                    <span className="text-muted block mb-1">Source: {rfq.sourceType}</span>
                    <p className="whitespace-pre-wrap">{rfq.rawText}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No raw RFQ source text attached.</p>
            )}
          </div>

          {/* Customer Questions */}
          <div className="rounded-lg border bg-white p-5 space-y-4 border-line">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink">Customer Questions / Clarifications</h3>
              <Badge variant={order.questions?.some((q) => q.status === 'OPEN') ? 'danger' : 'default'}>
                {order.questions?.filter((q) => q.status === 'OPEN').length || 0} Open
              </Badge>
            </div>

            {order.questions && order.questions.length > 0 ? (
              <div className="space-y-2">
                {order.questions.map((q) => (
                  <div key={q.id} className="rounded border p-3 text-xs space-y-1 border-line">
                    <div className="flex justify-between">
                      <strong className="text-muted">{q.question}</strong>
                      <span className={q.status === 'OPEN' ? 'text-danger font-bold' : 'text-success'}>
                        {q.status}
                      </span>
                    </div>
                    {q.answer && <p className="text-muted italic">Ans: {q.answer}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No customer questions logged.</p>
            )}

            <form onSubmit={handleAddQuestion} className="pt-2 border-t flex gap-2 border-line">
              <Input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Log question or clarification…"
                className="flex-1 rounded border px-3 py-1.5 text-xs border-line"
              />
              <Button type="submit" variant="soft" disabled={addQuestionMutation.isPending}>
                Add
              </Button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'engineering' && (
        <div className="rounded-lg border bg-white p-6 space-y-4 border-line">
          <div className="flex items-center justify-between border-b pb-3 border-line">
            <div>
              <h3 className="font-semibold text-base">Engineering Revision #{latestEng?.revisionNumber}</h3>
              <p className="text-xs text-muted">Status: {latestEng?.status} · Version: {latestEng?.workflowVersionId ? 'Linked' : 'Unassigned'}</p>
            </div>
            <Link href={`/engineering/orders/${order.id}`} className="btn primary ">Open Engineering Editor</Link>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted uppercase mb-2">Reviewed Bill of Materials</h4>
            {latestEng?.bomLines && latestEng.bomLines.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-surface-muted text-muted border-line">
                    <th className="p-2">Operation Node</th>
                    <th className="p-2">Component Item</th>
                    <th className="p-2">UOM</th>
                    <th className="p-2">Requirement / Output Unit</th>
                    <th className="p-2">Allowance</th>
                  </tr>
                </thead>
                <tbody>
                  {latestEng.bomLines.map((b: any) => (
                    <tr key={b.id} className="border-b border-line">
                      <td className="p-2 font-mono font-bold text-primary">{b.operationNodeKey}</td>
                      <td className="p-2">{b.item?.name || b.itemId}</td>
                      <td className="p-2">{b.inputUom?.code || b.inputUomId}</td>
                      <td className="p-2">{Number(b.requirementAtoms) / 1_000_000}</td>
                      <td className="p-2">{b.allowancePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted">No BOM lines attached to this engineering revision.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'production' && (
        <div className="rounded-lg border bg-white p-6 border-line">
          <h3 className="font-semibold text-sm mb-4">Production Execution Tasks</h3>
          {instance && instance.tasks && instance.tasks.length > 0 ? (
            <div className="space-y-3">
              {instance.tasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between border rounded p-3 text-sm border-line">
                  <div>
                    <span className="font-mono font-bold text-primary">{task.nodeKey}</span>
                    <span className="ml-3 text-muted">{task.plannedDurationMinutes} mins planned</span>
                    {task.assignedTechnician && (
                      <span className="ml-3 text-xs bg-surface-muted rounded px-2 py-0.5">
                        Tech: {task.assignedTechnician.name}
                      </span>
                    )}
                  </div>
                  <Badge variant={task.status === 'READY' ? 'blue' : 'default'}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted">
              <p className="text-sm">Order has not been released to production yet.</p>
              <p className="text-xs mt-1">Approve engineering review and click &ldquo;Release to production&rdquo; to instantiate task DAG.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="rounded-lg border bg-white p-6 border-line">
          <h3 className="font-semibold text-sm mb-4">Material Demand Requirements</h3>
          <p className="text-xs text-muted mb-4">
            Demands calculated from reviewed BOM basis and order target quantity. Shortage prevents operation start.
          </p>
          {/* Note: Demands are shown here */}
          <div className="text-center py-6 text-muted">
            {order.status === 'RELEASED' || order.status === 'IN_PRODUCTION' ? (
              <p className="text-xs text-success font-semibold">Material demand registered in supply ledger.</p>
            ) : (
              <p className="text-xs">Demand will instantiate upon order release.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
