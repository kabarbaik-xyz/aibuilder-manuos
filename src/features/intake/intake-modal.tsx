'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useGraphStore } from '../../store/graph-store';
import {
  validateWorkflowDAG,
  WorkflowNode,
  WorkflowEdge,
} from '../../engines/workflow-validate';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const PRESETS = {
  panel: {
    name: 'Custom control panel',
    text: 'Please quote 120 custom control panels in aluminum 6061-T6. CNC machining, bending and electrical assembly required. Delivery requested November 25. Please confirm finish and dimensional tolerances.',
  },
  aerospace: {
    name: 'Titanium Ti-6Al-4V Actuator Manifold',
    text: 'Request for Quotation: 60 units Titanium Ti-6Al-4V Actuator Manifolds. Requires 5-axis CNC machining, wire EDM, and 350-bar hydrostatic pressure testing. Due Dec 10, 2026. Surface finish Ra 0.8um.',
  },
  bracket: {
    name: 'Precision Mounting Bracket SS316',
    text: 'Procurement RFQ: 300 units Stainless Steel 316L mounting brackets. CNC laser cutting, 90-degree press brake bending, and nitric passivation. Tolerance required ±0.05mm. Delivery needed in 3 weeks.',
  },
};

export function IntakeModal() {
  const store = useGraphStore();
  const { closeModal } = store;

  const [rfqText, setRfqText] = useState(PRESETS.panel.text);
  const [extractedDraft, setExtractedDraft] = useState<any | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([]);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(PRESETS.panel.name);

  const applyPreset = (key: keyof typeof PRESETS) => {
    setRfqText(PRESETS[key].text);
    setWorkflowName(PRESETS[key].name);
    setExtractedDraft(null);
    setShowWorkflow(false);
  };

  const handleExtract = async () => {
    if (!rfqText.trim()) return;
    setLoading(true);
    setRequestError(null);
    setExtractedDraft(null);

    try {
      const res = await fetch('/api/ai/extract-rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfqText }),
      });

      const data = await res.json();
      if (!res.ok || !data.aiResult) {
        setRequestError(data.error ?? 'RFQ extraction is unavailable. Retry later.');
        return;
      }
      const rawRouting = data.aiResult.routing || data.aiResult.draftRouting;
      setExtractedDraft({
        ...data.aiResult,
        routing: Array.isArray(rawRouting) ? rawRouting.map((r: any) => typeof r === 'string' ? r : r.operation || r.name) : [],
        ambiguities: Array.isArray(data.aiResult.ambiguities) ? data.aiResult.ambiguities : [],
      });
      if (data.aiResult.partName) setWorkflowName(data.aiResult.partName);
    } catch {
      setRequestError('RFQ extraction is unavailable. Retry later.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWorkflow = async () => {
    setLoading(true);
    setRequestError(null);
    setShowWorkflow(false);

    try {
      const res = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderTypeName: workflowName,
          description: rfqText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.aiResult?.nodes && data.aiResult?.edges) {
          const validation = validateWorkflowDAG(
            data.aiResult.nodes,
            data.aiResult.edges
          );
          if (validation.isValid) {
            setWorkflowNodes(data.aiResult.nodes);
            setWorkflowEdges(data.aiResult.edges);
            setShowWorkflow(true);
            return;
          }
          setRequestError('The generated workflow did not pass DAG validation. Review the input and retry.');
      } else {
        setRequestError(data.error ?? 'Workflow generation is unavailable. Retry later.');
      }
    } catch {
      setRequestError('Workflow generation is unavailable. Retry later.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDraftOrder = () => {
    store.showToast(
      'Draft preview closed. No order was created.'
    );
    closeModal();
  };

  return (
    <div>
      <div className="field">
        <div className="between mb-1.5">
          <label htmlFor="rfq-text">Customer request / drawing notes</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn small-btn"
              onClick={() => applyPreset('panel')}
            >
              Control Panel
            </button>
            <button
              type="button"
              className="btn small-btn"
              onClick={() => applyPreset('aerospace')}
            >
              Aerospace Ti
            </button>
            <button
              type="button"
              className="btn small-btn"
              onClick={() => applyPreset('bracket')}
            >
              SS Bracket
            </button>
          </div>
        </div>

        <textarea
          id="rfq-text"
          value={rfqText}
          onChange={(e) => setRfqText(e.target.value)}
          placeholder="Paste customer email, drawing notes, or RFQ specifications…"
          rows={4}
        />
        <span className="hint">
          Supports multi-line inquiries, materials (6061-T6, Ti-6Al-4V, SS316), and manufacturing operations.
        </span>
      </div>

      {requestError && <p role="alert" className="mt-2 text-sm text-red-700">{requestError}</p>}

      <div className="flex gap-2">
        <Button
          variant="primary"
          icon="spark"
          disabled={loading}
          onClick={handleExtract}
        >
          {loading ? 'Analyzing RFQ…' : 'Prepare draft'}
        </Button>
        {rfqText && (
          <Button variant="ghost" onClick={() => setRfqText('')}>
            Clear
          </Button>
        )}
      </div>

      {extractedDraft && (
        <div className="result-box mt">
          <div className="between pb-2 border-b border-[var(--line)] border-line">
            <div>
              <h3>Engineering Review Draft</h3>
              <p className="small muted">Structured specification parsed by Copilot</p>
            </div>
            <Badge variant="blue">Copilot Extraction</Badge>
          </div>

          <div className="spec-row">
            <span>Part name</span>
            <strong>{extractedDraft.partName}</strong>
          </div>
          <div className="spec-row">
            <span>Quantity / Material</span>
            <strong>
              {extractedDraft.qty} units · {extractedDraft.material}
            </strong>
          </div>
          <div className="spec-row">
            <span>Routing</span>
            <div className="routing-flow">
              {Array.isArray(extractedDraft.routing) && extractedDraft.routing.length > 0 ? (
                extractedDraft.routing.map((step: string, idx: number) => (
                  <React.Fragment key={idx}>
                    <span className="routing-pill">
                      <span className="pill-num">{idx + 1}</span>
                      <span>{step}</span>
                    </span>
                    {idx < extractedDraft.routing.length - 1 && (
                      <span className="routing-sep">→</span>
                    )}
                  </React.Fragment>
                ))
              ) : <span className="muted">No routing steps returned.</span>}
            </div>
          </div>

          {/* Ambiguities highlighted cleanly */}
          {Array.isArray(extractedDraft.ambiguities) && extractedDraft.ambiguities.length > 0 && (
            <div className="need-highlight mt">
              <strong>
                <Icon name="alert" className="w-3.5 h-3.5" />
                {extractedDraft.ambiguities.length} Customer Clarifications Required
              </strong>
              <p>Resolve with customer before quotation commit:</p>
              <ul>
                {extractedDraft.ambiguities.map((amb: string, i: number) => (
                  <li key={i}>{amb}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="field mt">
            <label htmlFor="wf-name">Order type template</label>
            <input
              id="wf-name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="e.g. Hydraulic Actuator Manifold"
            />
          </div>

          {!showWorkflow ? (
            <Button
              icon="graph"
              className="mt"
              onClick={handleGenerateWorkflow}
              disabled={loading}
            >
              {loading ? 'Drafting workflow DAG…' : 'Preview dynamic workflow'}
            </Button>
          ) : (
            <div className="mt-4 pt-3 border-t border-[var(--line)] border-line">
              <div className="between mb-2">
                <strong className="text-xs">Generated DAG Sequence:</strong>
                <Badge variant="success">Validated Acyclic DAG</Badge>
              </div>

              <div className="workflow-preview">
                {workflowNodes.map((node, index) => (
                  <div key={node.id} className="workflow-step">
                    <div className="workflow-step-main">
                      <span className="workflow-step-num">{index + 1}</span>
                      <span className="workflow-step-name">{node.name}</span>
                    </div>
                    <Badge variant="default">{node.department}</Badge>
                  </div>
                ))}
              </div>

              <p className="small muted mt-2">
                AI proposal only. Verify steps, qualifications, materials, and capacity before use.
              </p>

              <Button
                variant="primary"
                fullWidth
                className="mt-4"
                icon="check"
                onClick={handleConfirmDraftOrder}
              >
                Close preview
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="between mt-4 pt-3 border-t border-[var(--line)] border-line">
        <span className="small muted">Need full workspace view?</span>
        <Link
          href="/orders/new"
          onClick={() => closeModal()}
          className="text-btn small"
        >
          Open full-page Copilot intake studio →
        </Link>
      </div>

      <p className="approval-note">
        Engineering Copilot & Dynamic Workflow. Arbitrary text is verified by engineers before creating draft orders.
      </p>
    </div>
  );
}
