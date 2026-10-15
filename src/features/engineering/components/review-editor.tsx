'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EngineeringRevisionDto } from '../api';
import { useSaveEngineeringDraft, useEngineeringAction } from '../hooks';
import { useItems, useUoms } from '@/features/masters/hooks';
import { useWorkflowTemplates } from '@/features/workflows/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormErrorSummary } from '@/components/ui/form-errors';

interface ReviewEditorProps {
  orderId: string;
  revision: EngineeringRevisionDto;
}

export function ReviewEditor({ orderId, revision }: ReviewEditorProps) {
  const router = useRouter();
  const saveDraftMutation = useSaveEngineeringDraft(orderId, revision.id);
  const actionMutation = useEngineeringAction(orderId, revision.id);

  const { data: itemsRes } = useItems();
  const items = itemsRes?.data || [];
  const { data: uomsRes } = useUoms();
  const uoms = uomsRes?.data || [];
  const { data: templates = [] } = useWorkflowTemplates();

  const isReadOnly = revision.status === 'APPROVED' || revision.status === 'SUPERSEDED';

  const [workflowVersionId, setWorkflowVersionId] = useState(revision.workflowVersionId || '');
  const [specs, setSpecs] = useState<Record<string, any>>(() => {
    try {
      return JSON.parse(revision.specsJson || '{}');
    } catch {
      return {};
    }
  });

  const [bomLines, setBomLines] = useState<any[]>(() => {
    return (revision.bomLines || []).map((b) => ({
      operationNodeKey: b.operationNodeKey,
      itemId: b.itemId,
      inputUomId: b.inputUomId,
      requirementQuantity: Number(b.requirementAtoms) / 1_000_000,
      outputBasis: 1,
      allowancePercent: b.allowancePercent || 0.0,
    }));
  });

  const [newLineNode, setNewLineNode] = useState('OP-10');
  const [newLineItem, setNewLineItem] = useState('');
  const [newLineUom, setNewLineUom] = useState('');
  const [newLineQty, setNewLineQty] = useState(1);
  const [newLineAllowance, setNewLineAllowance] = useState(0);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available published versions across templates
  const publishedVersions = templates.flatMap((t) =>
    (t.versions || [])
      .filter((v) => v.status === 'PUBLISHED')
      .map((v) => ({
        id: v.id,
        label: `${t.name} (v${v.versionNumber})`,
      }))
  );

  const handleAddBomLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineItem || !newLineUom) return;

    setBomLines((prev) => [
      ...prev,
      {
        operationNodeKey: newLineNode,
        itemId: newLineItem,
        inputUomId: newLineUom,
        requirementQuantity: Number(newLineQty),
        outputBasis: 1,
        allowancePercent: Number(newLineAllowance) || 0.0,
      },
    ]);

    setNewLineItem('');
    setNewLineQty(1);
    setNewLineAllowance(0);
  };

  const handleRemoveBomLine = (idx: number) => {
    if (isReadOnly) return;
    setBomLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    setErrorMsg(null);
    saveDraftMutation.mutate(
      {
        expectedVersion: revision.version,
        workflowVersionId: workflowVersionId || undefined,
        specs,
        outputBasis: 1,
        bomLines,
      },
      {
        onError: (err: any) => setErrorMsg(err.message),
      }
    );
  };

  const handleAction = (action: 'submit_review' | 'approve') => {
    setErrorMsg(null);
    actionMutation.mutate(action, {
      onError: (err: any) => setErrorMsg(err.message),
      onSuccess: () => {
        router.refresh();
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-6 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">
              Engineering Revision #{revision.revisionNumber}
            </h1>
            <Badge variant={revision.status === 'APPROVED' ? 'success' : 'default'}>
              {revision.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Order ID: <span className="font-mono">{orderId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && revision.status === 'DRAFT' && (
            <>
              <Button
                variant="default"
                onClick={handleSave}
                disabled={saveDraftMutation.isPending}
              >
                {saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                variant="soft"
                onClick={() => handleAction('submit_review')}
                disabled={actionMutation.isPending}
              >
                Submit review
              </Button>
              <Button
                variant="primary"
                onClick={() => handleAction('approve')}
                disabled={actionMutation.isPending}
              >
                Approve revision
              </Button>
            </>
          )}

          {!isReadOnly && revision.status === 'REVIEW' && (
            <Button
              variant="primary"
              onClick={() => handleAction('approve')}
              disabled={actionMutation.isPending}
            >
              Approve revision
            </Button>
          )}
        </div>
      </div>

      {errorMsg && <FormErrorSummary message={errorMsg} />}

      {isReadOnly && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          This engineering revision is <strong>APPROVED</strong> and immutable. Running work is strictly pinned to this specification.
        </div>
      )}

      {/* Workflow Process Linkage */}
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
          1. Process Routing / Workflow Version
        </h3>
        <p className="text-xs text-slate-500">
          Select the published workflow definition that defines valid production operations for this order.
        </p>

        <div className="max-w-md">
          <label className="text-xs font-medium text-slate-700">Workflow Version *</label>
          <select
            value={workflowVersionId}
            onChange={(e) => setWorkflowVersionId(e.target.value)}
            disabled={isReadOnly}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
          >
            <option value="">Select published process…</option>
            {publishedVersions.map((pv) => (
              <option key={pv.id} value={pv.id}>
                {pv.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Engineering Specs */}
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
          2. Technical Specifications
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-700">Drawing Reference Number</label>
            <input
              type="text"
              value={specs.drawingNumber || ''}
              onChange={(e) => setSpecs({ ...specs, drawingNumber: e.target.value })}
              disabled={isReadOnly}
              placeholder="e.g. DWG-2026-RevB"
              className="w-full rounded border px-3 py-1.5 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Heat Treatment Specification</label>
            <input
              type="text"
              value={specs.heatTreatment || ''}
              onChange={(e) => setSpecs({ ...specs, heatTreatment: e.target.value })}
              disabled={isReadOnly}
              placeholder="e.g. AMS-4928"
              className="w-full rounded border px-3 py-1.5 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Critical Tolerance</label>
            <input
              type="text"
              value={specs.tolerance || ''}
              onChange={(e) => setSpecs({ ...specs, tolerance: e.target.value })}
              disabled={isReadOnly}
              placeholder="e.g. ±0.025 mm"
              className="w-full rounded border px-3 py-1.5 text-sm mt-1"
            />
          </div>
        </div>
      </div>

      {/* Bill of Materials */}
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
            3. Bill of Materials (BOM)
          </h3>
          <span className="text-xs text-slate-500">Output basis: 1 finished unit</span>
        </div>

        {/* Existing BOM Lines */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-600">
                <th className="p-2.5">Operation Node</th>
                <th className="p-2.5">Component / Material</th>
                <th className="p-2.5">UOM</th>
                <th className="p-2.5">Requirement Qty</th>
                <th className="p-2.5">Allowance %</th>
                {!isReadOnly && <th className="p-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {bomLines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400">
                    No BOM lines configured yet.
                  </td>
                </tr>
              ) : (
                bomLines.map((line, idx) => {
                  const itemObj = items.find((it) => it.id === line.itemId);
                  const uomObj = uoms.find((u) => u.id === line.inputUomId);
                  return (
                    <tr key={idx} className="border-b">
                      <td className="p-2.5 font-mono font-bold text-blue-600">{line.operationNodeKey}</td>
                      <td className="p-2.5">{itemObj ? `${itemObj.code} - ${itemObj.name}` : line.itemId}</td>
                      <td className="p-2.5">{uomObj ? uomObj.code : line.inputUomId}</td>
                      <td className="p-2.5">{line.requirementQuantity}</td>
                      <td className="p-2.5">{line.allowancePercent}%</td>
                      {!isReadOnly && (
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveBomLine(idx)}
                            className="text-rose-500 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add BOM Line form */}
        {!isReadOnly && (
          <form onSubmit={handleAddBomLine} className="mt-4 border-t pt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-slate-600">Operation Node</label>
              <input
                type="text"
                value={newLineNode}
                onChange={(e) => setNewLineNode(e.target.value)}
                placeholder="OP-10"
                className="w-full rounded border px-2 py-1.5 text-xs"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-600">Material / Part</label>
              <select
                value={newLineItem}
                onChange={(e) => setNewLineItem(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs"
                required
              >
                <option value="">Select item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.code} - {it.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Input UOM</label>
              <select
                value={newLineUom}
                onChange={(e) => setNewLineUom(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs"
                required
              >
                <option value="">Select UOM…</option>
                {uoms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} ({u.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Qty / Unit</label>
              <input
                type="number"
                step="any"
                min="0.0001"
                value={newLineQty}
                onChange={(e) => setNewLineQty(Number(e.target.value))}
                className="w-full rounded border px-2 py-1.5 text-xs"
                required
              />
            </div>

            <div>
              <Button type="submit" variant="soft" className="w-full">
                Add Line
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
