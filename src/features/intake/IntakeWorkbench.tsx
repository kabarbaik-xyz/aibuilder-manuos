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
import { Tabs } from '@/components/ui/tabs';
import { Icon } from '@/components/icons';
import './intake-workbench.css';

interface RFQExtraction {
  customer: string;
  partName: string;
  qty: number;
  partNumber?: string;
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
    sourceDocumentId: string | null;
    sourceFileName: string | null;
    citations: Array<{ field: string; quote: string }>;
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
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');
  const [rfqText, setRfqText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<RFQExtraction | null>(null);
  const [originalResult, setOriginalResult] = useState<RFQExtraction | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<{ sourceHash: string; model: string | null; promptVersion: string; sourceFileName: string | null; sourceDocumentId: string | null } | null>(null);
  const [sourceCitations, setSourceCitations] = useState<Array<{ field: string; quote: string }>>([]);
  const [reviewed, setReviewed] = useState(false);
  const [matched, setMatched] = useState<MatchedMasterIds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  function clearExtraction() {
    setResult(null); setOriginalResult(null); setReviewId(null); setProvenance(null); setSourceCitations([]); setReviewed(false); setMatched(null);
  }

  function showExtraction(data: NonNullable<RFQExtractionResponse['data']>) {
    setRfqText(data.rawText);
    setResult(data.extraction);
    setOriginalResult(data.extraction);
    setReviewId(data.id);
    setProvenance({ sourceHash: data.sourceHash, model: data.model, promptVersion: data.promptVersion, sourceFileName: data.sourceFileName, sourceDocumentId: data.sourceDocumentId });
    setSourceCitations(data.citations);
    setMatched(data.matchedMasters);
  }

  async function extract(event: React.FormEvent) {
    event.preventDefault();
    if (!rfqText.trim() || pending) return;
    setPending(true);
    setError(null);
    setUnavailableReason(null);
    clearExtraction();
    try {
      const response = await apiRequest<RFQExtractionResponse>('/api/engineering/intake/extractions', {
        method: 'POST',
        body: JSON.stringify({ text: rfqText.trim() }),
      });
      if (!response.data) {
        setUnavailableReason(`Extraction unavailable (${response.reason ?? 'provider unavailable'}). No review record or order draft was created.`);
      } else {
        showExtraction(response.data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RFQ extraction failed.');
    } finally {
      setPending(false);
    }
  }

  async function extractFile(event: React.FormEvent) {
    event.preventDefault();
    if (!sourceFile || pending) return;
    setPending(true); setError(null); setUnavailableReason(null); clearExtraction();
    try {
      const form = new FormData();
      form.set('file', sourceFile);
      form.set('description', 'Source RFQ for AI-assisted engineering intake');
      const uploaded = await apiRequest<{ id: string }>('/api/documents/upload', { method: 'POST', body: form });
      const response = await apiRequest<RFQExtractionResponse>('/api/engineering/intake/extractions', { method: 'POST', body: JSON.stringify({ documentId: uploaded.id }) });
      if (!response.data) setUnavailableReason(`Extraction unavailable (${response.reason ?? 'provider unavailable'}). The uploaded source remains stored, but no review or order draft was created.`);
      else showExtraction(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RFQ document extraction failed.');
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
      <ol className="rfq-flow" aria-label="RFQ intake progress">
        <li aria-current={!result ? 'step' : undefined} className={!result ? 'is-current' : 'is-complete'}><Icon name={result ? 'check' : 'order'} /><div><strong>Add your request</strong><span>Paste text or select a file</span></div></li>
        <li aria-current={result && !reviewed ? 'step' : undefined} className={result && !reviewed ? 'is-current' : reviewed ? 'is-complete' : ''}><Icon name="search" /><div><strong>Review extracted fields</strong><span>Check details against the source</span></div></li>
        <li aria-current={reviewed ? 'step' : undefined} className={reviewed ? 'is-current' : ''}><Icon name="arrow" /><div><strong>Prepare order draft</strong><span>Continue after saving your review</span></div></li>
      </ol>
      <div className="rfq-intake-layout">
        <Panel className="rfq-source-panel">
          <div className="rfq-section-heading"><div><h2>Customer request</h2><p>Start with the RFQ. You’ll review the extracted details before creating an order.</p></div>{reviewId && <Badge variant={reviewed ? 'success' : 'warning'}>{reviewed ? 'Reviewed' : 'Ready to review'}</Badge>}</div>
          <Tabs variant="segmented" ariaLabel="RFQ source" activeId={sourceMode} onChange={setSourceMode} items={[{ id: 'text', label: 'Paste text', disabled: pending || Boolean(reviewId) }, { id: 'file', label: 'Upload file', disabled: pending || Boolean(reviewId) }]} />
          {sourceMode === 'text' ? <form className="rfq-source-form" onSubmit={extract}>
            <FormField id={id} label="RFQ text" help="Include the part, quantity, material, and any delivery or quality requirements.">
              <Textarea id={id} value={rfqText} maxLength={20_000} rows={9} onChange={event => setRfqText(event.target.value)} placeholder="Paste the customer’s email, specification, or request here…" disabled={pending || Boolean(reviewId)} />
            </FormField>
            <div className="rfq-source-actions"><span className="small muted">{rfqText.length.toLocaleString()} / 20,000 characters</span><Button type="submit" variant="primary" icon="spark" disabled={pending || Boolean(reviewId) || !rfqText.trim()}>{pending ? 'Extracting details…' : 'Extract for review'}</Button></div>
          </form> : <form className="rfq-source-form" onSubmit={extractFile}>
            <div className="rfq-upload-area"><Icon name="order" /><h3>Select your RFQ document</h3><p>UTF-8 TXT or CSV · up to 10 MB</p><label htmlFor={`${id}-file`} className="sr-only">Choose RFQ file</label><Input id={`${id}-file`} className="rfq-file-input" type="file" accept=".txt,.csv,text/plain,text/csv" disabled={pending || Boolean(reviewId)} onChange={event => setSourceFile(event.target.files?.[0] ?? null)} />{sourceFile && <p className="rfq-selected-file">{sourceFile.name} · {(sourceFile.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</p>}</div>
            <div className="rfq-source-actions"><span className="small muted">Up to 20,000 characters are sent for extraction.</span><Button type="submit" variant="primary" icon="spark" disabled={pending || Boolean(reviewId) || !sourceFile}>{pending ? 'Uploading and extracting…' : 'Upload and extract'}</Button></div>
          </form>}
          {reviewId && <div className="rfq-source-reset"><p className="small muted">Source locked for this review. Start again to use a different request.</p><Button type="button" disabled={pending || savingReview} onClick={() => { clearExtraction(); setError(null); setUnavailableReason(null); }}>Start new extraction</Button></div>}
          {error && <p className="rfq-feedback text-danger" role="alert">{error}</p>}
          {unavailableReason && <p className="rfq-feedback text-warning" role="status">{unavailableReason}</p>}
        </Panel>
        <aside className="rfq-intake-guide">
          <h2>What happens next</h2><p>AI prepares suggestions. You stay in control of the order.</p>
          <ul><li><Icon name="check" /><span>Review customer, part, quantity, and material.</span></li><li><Icon name="check" /><span>Compare source quotes and resolve unclear requirements.</span></li><li><Icon name="check" /><span>Save reviewed fields, then continue to an order draft.</span></li></ul>
          <div className="rfq-guide-note"><Icon name="info" /><div><strong>Before you upload</strong><p>TXT and CSV are supported. PDF and image OCR are not available. Use files permitted by your workspace’s AI provider policy.</p></div></div>
          <p className="small muted">Extraction does not create an order or approve BOM, routing, or QC suggestions.</p>
        </aside>
      </div>

      {result && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Review extraction</h2><p className="small muted mt-1">Compare each field with the source, correct it, then save the review before handing it to a new order draft.</p></div><Badge variant={reviewed ? 'success' : 'warning'}>{reviewed ? 'Reviewed' : 'Needs review'}</Badge></div>
          {provenance && <details className="rfq-provenance"><summary>Source and extraction details</summary><p className="small muted mt-3 break-all">{provenance.sourceFileName ? `Source file ${provenance.sourceFileName} · document ${provenance.sourceDocumentId}` : 'Source pasted text'} · SHA-256 {provenance.sourceHash} · schema {provenance.promptVersion} · model {provenance.model || 'provider model unavailable'}</p></details>}
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
          <section className="mt-4 rounded-lg border border-line bg-surface-muted p-3"><h3 className="text-sm font-semibold">Source-matched quotes</h3><p className="small muted mt-1">Each quote appears exactly in the source and contains the extracted field value. Confirm its meaning and context against the original.</p>{sourceCitations.length ? <ul className="mt-2 grid gap-2">{sourceCitations.map((citation, index) => <li key={`${citation.field}-${index}`} className="small"><span className="font-medium">{citation.field}</span><blockquote className="mt-1 rounded-lg bg-surface-muted p-3 text-ink">“{citation.quote}”</blockquote></li>)}</ul> : <p className="small muted mt-2">The extraction returned no source-matched quotes.</p>}</section>
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
