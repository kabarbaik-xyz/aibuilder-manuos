'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateWorkflowTemplate } from '@/features/workflows/hooks';
import { useOrderTypes } from '@/features/masters/hooks';
import { Button } from '@/components/ui/button';
import { FormErrorSummary } from '@/components/ui/form-errors';

export default function NewWorkflowPage() {
  const router = useRouter();
  const createTemplate = useCreateWorkflowTemplate();
  const { data: orderTypesRes } = useOrderTypes();
  const orderTypes = orderTypesRes?.data || [];

  const [orderTypeId, setOrderTypeId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!orderTypeId || !code.trim() || !name.trim()) {
      setErrorMsg('Order type, code, and name are required.');
      return;
    }

    createTemplate.mutate(
      {
        orderTypeId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (res: any) => {
          router.push(`/workflows/${res.data.id}/versions/${res.data.initialVersionId}`);
        },
        onError: (err: any) => {
          setErrorMsg(err.message || 'Failed to create workflow template');
        },
      }
    );
  };

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-xl font-bold text-slate-900">New Workflow Routing</h1>
        <p className="text-sm text-slate-500">
          Create a new production routing template associated with an order type.
        </p>
      </div>

      {errorMsg && <FormErrorSummary message={errorMsg} />}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <label className="text-xs font-medium text-slate-700">Order Type *</label>
          <select
            value={orderTypeId}
            onChange={(e) => setOrderTypeId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          >
            <option value="">Select Order Type…</option>
            {orderTypes.map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.code} - {ot.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">Template Code * (e.g. WF-TURNING-01)</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="WF-TURNING-01"
            className="w-full rounded border px-3 py-2 text-sm mt-1 uppercase font-mono"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">Workflow Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Precision Turning & Milling Process"
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">Description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of process stages and equipment requirements…"
            className="w-full rounded border px-3 py-2 text-sm mt-1"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="default" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={createTemplate.isPending}>
            {createTemplate.isPending ? 'Creating…' : 'Initialize Workflow & Open Editor'}
          </Button>
        </div>
      </form>
    </div>
  );
}
