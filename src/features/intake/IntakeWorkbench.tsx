'use client';

import { useId, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import Link from 'next/link';

interface RFQExtraction {
  customer: string;
  partName: string;
  qty: number;
  material: string;
  tolerances: string[];
  ambiguities: string[];
  draftBOM: Array<{ partNumber: string; name: string; qtyPerUnit: number; leadTimeDays?: number }>;
  draftRouting: Array<{ sequence: number; operation: string; machineClass: string; plannedHours: number }>;
  qcChecklist: string[];
}

interface RFQExtractionResponse {
  data: {
    id: string;
    rawText: string;
    extraction: RFQExtraction;
    sourceHash: string;
    model: string | null;
    promptVersion: string;
    reviewState: 'NEEDS_REVIEW' | 'REVIEWED';
    matchedMasters: { customerId: string | null; itemId: string | null; uomId: string | null };
  } | null;
  reason?: string;
}

type MatchedMasterIds = { customerId: string | null; itemId: string | null; uomId: string | null };

export function IntakeWorkbench() {
  const id = useId();
  const [rfqText, setRfqText] = useState('');
  const [result, setResult] = useState<RFQExtraction | null>(null);
  const [originalResult, setOriginalResult] = useState<RFQExtraction | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<{ sourceHash: string; model: string | null; promptVersion: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [matched, setMatched] = useState<MatchedMasterIds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    if (!rfqText.trim() || pending) return;
    setPending(true);
    setError(null);
    setUnavailableReason(null);
    setResult(null);
    setOriginalResult(null);
    setReviewId(null);
    setProvenance(null);
    setReviewed(false);
    setMatched(null);
    try {
      const response = await apiRequest<RFQExtractionResponse>('/api/engineering/intake/extractions', {
        method: 'POST',
        body: JSON.stringify({ text: rfqText.trim() }),
      });
      if (!response.data) {
        setUnavailableReason(`Extraction unavailable (${response.reason ?? 'provider unavailable'}). No review record or order draft was created.`);
      } else {
        setResult(response.data.extraction);
        setOriginalResult(response.data.extraction);
        setReviewId(response.data.id);
        setProvenance({ sourceHash: response.data.sourceHash, model: response.data.model, promptVersion: response.data.promptVersion });
        setMatched(response.data.matchedMasters);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RFQ extraction failed.');
    } finally {
      setPending(false);
    }
  }

  async function saveReview() {
    if (!reviewId || !result || savingReview || reviewed) return;
    setSavingReview(true);
    setError(null);
    try {
      await apiRequest(`/api/engineering/intake/extractions/${reviewId}`, { method: 'PATCH', body: JSON.stringify({ extraction: result }) });
      setReviewed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the review.');
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <div className="page-stack">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold">Paste customer request</h2><p className="small muted mt-1">Text only, up to 20,000 characters. Do not paste confidential information unless your workspace provider policy allows it.</p></div>
          <Badge variant="warning">No order created</Badge>
        </div>
        <form className="mt-4 page-stack" onSubmit={extract}>
          <label htmlFor={id} className="text-sm font-medium">RFQ text</label>
          <Textarea id={id} value={rfqText} maxLength={20_000} rows={9} onChange={event => setRfqText(event.target.value)} placeholder="Paste the customer's specification or request…" disabled={pending || Boolean(reviewId)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="small muted">{rfqText.length.toLocaleString()} / 20,000 characters</span>
            <div className="flex gap-2">{reviewId && <Button type="button" onClick={() => { setResult(null); setOriginalResult(null); setReviewId(null); setProvenance(null); setMatched(null); setReviewed(false); }}>Start new extraction</Button>}<Button type="submit" variant="primary" icon="spark" disabled={pending || Boolean(reviewId) || !rfqText.trim()}>{pending ? 'Extracting…' : 'Extract for review'}</Button></div>
          </div>
        </form>
        {error && <p className="small mt-3 text-danger" role="alert">{error}</p>}
        {unavailableReason && <p className="small mt-3 text-warning" role="status">{unavailableReason} No draft has been created.</p>}
      </Panel>

      {result && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Review extraction</h2><p className="small muted mt-1">Compare each field with the source, correct it, then save the review before handing it to a new order draft.</p></div><Badge variant={reviewed ? 'success' : 'warning'}>{reviewed ? 'Reviewed' : 'Needs review'}</Badge></div>
          {provenance && <p className="small muted mt-3 break-all">Source SHA-256 {provenance.sourceHash} · schema {provenance.promptVersion} · model {provenance.model || 'provider model unavailable'}</p>}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section><h3 className="text-sm font-semibold">Original customer text</h3><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink">{rfqText.trim()}</pre></section>
            <section className="page-stack">
              <FormField id={`${id}-customer`} label="Customer from request"><Input value={result.customer} disabled={reviewed || savingReview} onChange={event => setResult(current => current ? { ...current, customer: event.target.value } : current)} /></FormField>
              <FormField id={`${id}-part`} label="Part name"><Input value={result.partName} disabled={reviewed || savingReview} onChange={event => setResult(current => current ? { ...current, partName: event.target.value } : current)} /></FormField>
              <FormField id={`${id}-qty`} label="Requested quantity" help="Integer quantity as extracted; confirm unit before creating the order."><Input type="number" min="1" step="1" value={result.qty} disabled={reviewed || savingReview} onChange={event => setResult(current => current ? { ...current, qty: Number(event.target.value) } : current)} /></FormField>
              <FormField id={`${id}-material`} label="Material"><Input value={result.material} disabled={reviewed || savingReview} onChange={event => setResult(current => current ? { ...current, material: event.target.value } : current)} /></FormField>
              <p className="small muted">Master matching: customer {matched?.customerId ? 'matched' : 'needs selection'} · item {matched?.itemId ? 'matched' : 'needs selection'} · UOM {matched?.uomId ? 'matched' : 'needs confirmation'}.</p>
            </section>
          </div>
          {originalResult && <details className="rounded-lg border border-line bg-surface-muted p-3"><summary className="cursor-pointer text-sm font-medium">Original extracted values</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2 small"><div><dt className="muted">Customer</dt><dd>{originalResult.customer}</dd></div><div><dt className="muted">Part name</dt><dd>{originalResult.partName}</dd></div><div><dt className="muted">Quantity</dt><dd>{originalResult.qty}</dd></div><div><dt className="muted">Material</dt><dd>{originalResult.material}</dd></div><div className="sm:col-span-2"><dt className="muted">Tolerances</dt><dd>{originalResult.tolerances.length ? originalResult.tolerances.join(' · ') : 'None returned'}</dd></div><div className="sm:col-span-2"><dt className="muted">Open ambiguities</dt><dd>{originalResult.ambiguities.length ? originalResult.ambiguities.join(' · ') : 'None returned'}</dd></div></dl></details>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section><h3 className="text-sm font-semibold">Tolerances</h3>{result.tolerances.length ? <ul className="mt-1 list-disc pl-5 small">{result.tolerances.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="small muted mt-1">None identified</p>}</section>
            <section><h3 className="text-sm font-semibold">Questions to resolve</h3>{result.ambiguities.length ? <ul className="mt-1 list-disc pl-5 small">{result.ambiguities.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="small muted mt-1">No questions returned; verify against source text.</p>}</section>
            <section><h3 className="text-sm font-semibold">Suggested BOM</h3>{result.draftBOM.length ? <ul className="mt-1 list-disc pl-5 small">{result.draftBOM.map((row, index) => <li key={index}>{row.partNumber} · {row.name} · {row.qtyPerUnit} per unit{row.leadTimeDays == null ? '' : ` · ${row.leadTimeDays} days`}</li>)}</ul> : <p className="small muted mt-1">No BOM suggestions returned.</p>}</section>
            <section><h3 className="text-sm font-semibold">Suggested routing</h3>{result.draftRouting.length ? <ol className="mt-1 list-decimal pl-5 small">{result.draftRouting.map((row, index) => <li key={index}>{row.sequence}. {row.operation} · {row.machineClass} · {row.plannedHours} h</li>)}</ol> : <p className="small muted mt-1">No routing suggestions returned.</p>}</section>
            <section><h3 className="text-sm font-semibold">QC checklist suggestions</h3>{result.qcChecklist.length ? <ul className="mt-1 list-disc pl-5 small">{result.qcChecklist.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="small muted mt-1">No checklist suggestions returned.</p>}</section>
          </div>
          <p className="small muted mt-5 border-t border-line pt-3">Saved with the source-text SHA-256, extraction schema/model version and original extraction. Review edits are recorded separately. BOM, routing and QC suggestions still require engineering approval.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">{reviewed && reviewId ? <Link className="btn primary" href={`/orders/new?rfqDraftId=${encodeURIComponent(reviewId)}`}>Continue to order draft</Link> : <Button variant="primary" disabled={savingReview || !reviewId} onClick={() => void saveReview()}>{savingReview ? 'Saving review…' : 'Save reviewed fields'}</Button>}</div>
        </Panel>
      )}
    </div>
  );
}
