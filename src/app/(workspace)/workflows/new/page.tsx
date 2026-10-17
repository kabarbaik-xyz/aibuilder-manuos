'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  const [kind, setKind] = useState<'PRODUCTION_ROUTING' | 'ORDER_LIFECYCLE'>('PRODUCTION_ROUTING');
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
        kind,
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
    <div className="page-stack order-intake">
      <PageHeader title="New workflow" description="Create production routing for engineering, or an order lifecycle for cross-department ownership and handoffs." />

      {errorMsg && <FormErrorSummary message={errorMsg} />}

      <form onSubmit={handleSubmit} className="form-section space-y-6">
        <div>
          <label className="block text-sm font-medium text-ink">Workflow purpose *
          <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="w-full rounded border px-3 py-2 text-sm mt-1 border-line" required>
            <option value="PRODUCTION_ROUTING">Production routing · Engineering operations and dependencies</option>
            <option value="ORDER_LIFECYCLE">Order lifecycle · Stakeholder stages, ownership and handoffs</option>
          </Select></label>
          <p className="field-help">These are separate workflow types. A lifecycle stage can point to an approved production routing.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">Order Type *
          <Select
            value={orderTypeId}
            onChange={(e) => setOrderTypeId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1 border-line"
            required
          >
            <option value="">Select Order Type…</option>
            {orderTypes.map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.code} - {ot.name}
              </option>
            ))}
          </Select></label>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink">Template Code * (e.g. WF-TURNING-01)
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="WF-TURNING-01"
            className="w-full rounded border px-3 py-2 text-sm mt-1 uppercase font-mono border-line"
            required
          /></label>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink">Workflow Name *
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Precision Turning & Milling Process"
            className="w-full rounded border px-3 py-2 text-sm mt-1 border-line"
            required
          /></label>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink">Description
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of process stages and equipment requirements…"
            className="w-full rounded border px-3 py-2 text-sm mt-1 border-line"
          /></label>
        </div>

        <div className="form-page-actions border-t border-line pt-5">
          <Button type="button" variant="default" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={createTemplate.isPending}>
            {createTemplate.isPending ? 'Creating…' : 'Create workflow'}
          </Button>
        </div>
      </form>
    </div>
  );
}
