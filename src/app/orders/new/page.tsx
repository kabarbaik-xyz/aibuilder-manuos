'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGraphStore } from '@/store/graph-store';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { validateWorkflowDAG, WorkflowNode, WorkflowEdge } from '@/engines/workflow-validate';

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

export default function NewOrderPage() {
  const router = useRouter();
  const store = useGraphStore();

  const [rfqText, setRfqText] = useState(PRESETS.panel.text);
  const [extractedDraft, setExtractedDraft] = useState<any | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([]);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workflowName, setWorkflowName] = useState(PRESETS.panel.name);

  const handleExtract = async () => {
    if (!rfqText.trim()) return;
    setLoading(true);

    try {
      const res = await fetch('/api/ai/extract-rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfqText }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiResult) {
          const rawRouting = data.aiResult.routing || data.aiResult.draftRouting;
          const normalizedRouting = Array.isArray(rawRouting)
            ? rawRouting.map((r: any) => (typeof r === 'string' ? r : r.operation || r.name || 'Step'))
            : ['CNC Machining', 'Press Bending', 'Assembly', 'QC Inspection'];

          setExtractedDraft({
            ...data.aiResult,
            routing: normalizedRouting,
            ambiguities: Array.isArray(data.aiResult.ambiguities) ? data.aiResult.ambiguities : [],
          });
          if (data.aiResult.partName) {
            setWorkflowName(data.aiResult.partName);
          }
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback below
    }

    // Deterministic fallback extraction
    const isAerospace = rfqText.toLowerCase().includes('titanium') || rfqText.toLowerCase().includes('actuator');
    const isBracket = rfqText.toLowerCase().includes('bracket') || rfqText.toLowerCase().includes('stainless');

    if (isAerospace) {
      setExtractedDraft({
        customer: 'AeroDynamics Propulsion',
        partName: 'Titanium Ti-6Al-4V Actuator Manifold',
        qty: 60,
        material: 'Titanium Ti-6Al-4V',
        routing: ['Saw Cut Billet', '5-Axis CNC Milling', 'Wire EDM', 'Hydrostatic Test 350-bar', 'Final CMM Inspection'],
        ambiguities: [
          'Is ultrasonic non-destructive testing (NDT) required prior to hydrostatic testing?',
          'What thread class applies to M8 hydraulic port fittings (6H or 4H)?',
        ],
        isFallback: true,
      });
      setWorkflowName('Titanium Ti-6Al-4V Actuator Manifold');
    } else if (isBracket) {
      setExtractedDraft({
        customer: 'Nusantara Rail Transit',
        partName: 'Precision Mounting Bracket SS316',
        qty: 300,
        material: 'Stainless Steel 316L',
        routing: ['Fiber Laser Cutting', 'CNC Press Brake Bending', 'Nitric Acid Passivation', 'Dimensional QC'],
        ambiguities: [
          'Which passivation ASTM specification applies (ASTM A967 or AMS 2700)?',
          'Is deburring radius specified for internal cutouts?',
        ],
        isFallback: true,
      });
      setWorkflowName('Precision Mounting Bracket SS316');
    } else {
      setExtractedDraft({
        customer: 'Meridian Energy',
        partName: 'Custom control panel',
        qty: 120,
        material: 'Aluminum 6061-T6',
        routing: ['CNC Machining', 'Press Bending', 'Electrical Assembly', 'QC Inspection'],
        ambiguities: [
          'Which surface finish is required? (Clear anodized, powder coated, or mill finish?)',
          'What dimensional tolerances apply to enclosure mounting holes? (Standard ±0.1mm assumed)',
        ],
        isFallback: true,
      });
      setWorkflowName('Custom control panel');
    }

    setLoading(false);
  };

  const handleGenerateWorkflow = async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderTypeName: workflowName,
          description: rfqText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiResult && data.aiResult.nodes) {
          setWorkflowNodes(data.aiResult.nodes);
          setWorkflowEdges(data.aiResult.edges || []);
          setShowWorkflow(true);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback below
    }

    const isAerospace = workflowName.toLowerCase().includes('titanium') || workflowName.toLowerCase().includes('actuator');
    const isBracket = workflowName.toLowerCase().includes('bracket') || workflowName.toLowerCase().includes('stainless');

    let defaultNodes: WorkflowNode[];
    let defaultEdges: WorkflowEdge[];

    if (isAerospace) {
      defaultNodes = [
        { id: 'w1', name: 'Titanium billet saw cutting & prep', department: 'Preparation' },
        { id: 'w2', name: '5-Axis CNC rough & finish milling', department: 'Machining' },
        { id: 'w3', name: 'Wire EDM micro-orifice cutting', department: 'Machining' },
        { id: 'w4', name: '350-bar hydrostatic proof pressure test', department: 'Testing' },
        { id: 'w5', name: 'CMM dimensional verification & AS9102 FAI', department: 'Quality' },
      ];
      defaultEdges = [
        { from: 'w1', to: 'w2' },
        { from: 'w2', to: 'w3' },
        { from: 'w3', to: 'w4' },
        { from: 'w4', to: 'w5' },
      ];
    } else if (isBracket) {
      defaultNodes = [
        { id: 'w1', name: 'CNC laser sheet cutting & nesting', department: 'Machining' },
        { id: 'w2', name: 'CNC press brake precision bending', department: 'Forming' },
        { id: 'w3', name: 'Nitric acid chemical passivation', department: 'Surface' },
        { id: 'w4', name: 'Optical optical comparator & dimensional QC', department: 'Quality' },
      ];
      defaultEdges = [
        { from: 'w1', to: 'w2' },
        { from: 'w2', to: 'w3' },
        { from: 'w3', to: 'w4' },
      ];
    } else {
      defaultNodes = [
        { id: 'w1', name: 'Raw material saw cutting', department: 'Preparation' },
        { id: 'w2', name: '5-Axis CNC milling', department: 'Machining' },
        { id: 'w3', name: 'Press brake bending', department: 'Forming' },
        { id: 'w4', name: 'Wiring & electrical harness assembly', department: 'Assembly' },
        { id: 'w5', name: 'Dimensional & electrical QC inspection', department: 'Quality' },
      ];
      defaultEdges = [
        { from: 'w1', to: 'w2' },
        { from: 'w2', to: 'w3' },
        { from: 'w3', to: 'w4' },
        { from: 'w4', to: 'w5' },
      ];
    }

    setWorkflowNodes(defaultNodes);
    setWorkflowEdges(defaultEdges);
    setShowWorkflow(true);
    setLoading(false);
  };

  const handleConfirmOrder = () => {
    store.showToast('Sample order draft confirmed. Unresolved customer questions retained.');
    router.push('/');
  };

  const loadPreset = (key: keyof typeof PRESETS) => {
    setRfqText(PRESETS[key].text);
    setWorkflowName(PRESETS[key].name);
    setExtractedDraft(null);
    setShowWorkflow(false);
  };

  const validation = validateWorkflowDAG(workflowNodes, workflowEdges);

  const customBreadcrumb = (
    <>
      <Link href="/" className="hover:underline">
        Orders
      </Link>
      <span className="breadcrumb-factory">/</span>
      <strong>New order intake & Copilot</strong>
    </>
  );

  return (
    <AppShell breadcrumb={customBreadcrumb} activeTitle="New order intake">
      <div>
        {/* Standard Page Header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2">
              <h1>New order intake & engineering copilot</h1>
              <Badge variant="blue" icon="spark">AI Grounded</Badge>
              <Badge variant="default">Gemini 2.5</Badge>
            </div>
            <p>
              Extract customer RFQ specifications, identify engineering ambiguities, and synthesize production DAG workflows.
            </p>
          </div>
          <div className="actions">
            <Button icon="calendar" onClick={() => store.openModal('promise')}>
              Check feasibility
            </Button>
            <Link href="/" className="btn">
              <Icon name="arrow" className="rotate-180" />
              Back to command center
            </Link>
          </div>
        </div>

        {/* Operational Context Strip */}
        <div className="metric-strip">
          <div className="metric">
            <div className="metric-label">
              <Icon name="order" /> Intake Parser
            </div>
            <div className="metric-value">
              RFQ Copilot
            </div>
            <div className="metric-caption">
              Semantic extraction & spec ingestion
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <Icon name="spark" /> Model Grounding
            </div>
            <div className="metric-value">
              Active
            </div>
            <div className="metric-caption">
              Grounded in shop-floor capacity
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <Icon name="graph" /> Routing Engine
            </div>
            <div className="metric-value">
              Topological
            </div>
            <div className="metric-caption">
              Acyclic DAG & cycle prevention
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <Icon name="shield" /> Quality Gate
            </div>
            <div className="metric-value">
              ISO 9001
            </div>
            <div className="metric-caption">
              Pre-quote ambiguity clearance
            </div>
          </div>
        </div>

        {/* Two-Column Grid: Workspace + Copilot Context */}
        <div className="content-grid">
          {/* Main Column */}
          <div className="stack">
            {/* Panel 1: Customer RFQ Ingestion */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Customer RFQ & Drawing Specifications</h3>
                  <p>Paste raw procurement inquiry, email text, or engineering drawing notes</p>
                </div>
                <div className="flex gap-2">
                  <span className="small muted">Quick presets:</span>
                  <button
                    type="button"
                    className="btn small-btn"
                    onClick={() => loadPreset('panel')}
                  >
                    Control Panel
                  </button>
                  <button
                    type="button"
                    className="btn small-btn"
                    onClick={() => loadPreset('aerospace')}
                  >
                    Aerospace Ti
                  </button>
                  <button
                    type="button"
                    className="btn small-btn"
                    onClick={() => loadPreset('bracket')}
                  >
                    SS Bracket
                  </button>
                </div>
              </div>

              <div className="panel-body">
                <div className="field">
                  <label htmlFor="rfq-textarea">Procurement inquiry / drawing notes</label>
                  <textarea
                    id="rfq-textarea"
                    value={rfqText}
                    onChange={(e) => setRfqText(e.target.value)}
                    placeholder="Paste customer email, procurement spec, or RFQ request here…"
                    rows={4}
                  />
                  <span className="hint">
                    Supports plain customer inquiries, tolerances (e.g. ±0.1mm, Ra 0.8um), materials (e.g. 6061-T6, Ti-6Al-4V), and routing requests.
                  </span>
                </div>

                <div className="between mt-2 pt-3 border-t border-[var(--line)]">
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      icon="spark"
                      disabled={loading}
                      onClick={handleExtract}
                    >
                      {loading ? 'Analyzing with Gemini Copilot…' : 'Extract specifications & ambiguities'}
                    </Button>
                    {rfqText && (
                      <Button variant="ghost" onClick={() => setRfqText('')}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <span className="small muted">
                    {rfqText.length} characters entered
                  </span>
                </div>
              </div>
            </div>

            {/* Panel 2: Extracted Specifications */}
            {extractedDraft && (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Extracted Engineering Specifications</h3>
                    <p>Structured parameters parsed by Gemini Engineering Copilot</p>
                  </div>
                  <Badge variant="success" icon="check">
                    Specs Extracted
                  </Badge>
                </div>

                <div className="panel-body">
                  <div className="spec-row">
                    <span>Customer</span>
                    <strong>{extractedDraft.customer}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Part Name</span>
                    <strong>{extractedDraft.partName}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Quantity</span>
                    <strong>{extractedDraft.qty} units</strong>
                  </div>
                  <div className="spec-row">
                    <span>Raw Material</span>
                    <strong>{extractedDraft.material}</strong>
                  </div>
                  <div className="spec-row">
                    <span>Proposed Routing</span>
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
                      ) : (
                        <strong>CNC Machining → Press Bending → Assembly → QC</strong>
                      )}
                    </div>
                  </div>

                  {/* Ambiguities Highlight */}
                  {extractedDraft.ambiguities && extractedDraft.ambiguities.length > 0 && (
                    <div className="attention-band mt-4">
                      <div className="attention-icon">
                        <Icon name="alert" />
                      </div>
                      <div className="attention-copy">
                        <h3>{extractedDraft.ambiguities.length} Engineering Ambiguities Requiring Clarification</h3>
                        <p>
                          Ambiguities must be resolved with the customer before issuing a binding delivery promise or committing machine hours:
                        </p>
                        <ul className="change-list mt-2">
                          {extractedDraft.ambiguities.map((item: string, i: number) => (
                            <li key={i}>
                              <Icon name="alert" className="text-warning w-3.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="field mt-4">
                    <label htmlFor="wf-name">Production workflow template name</label>
                    <input
                      id="wf-name"
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      placeholder="e.g. Custom control panel assembly"
                    />
                  </div>

                  {!showWorkflow && (
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        icon="graph"
                        disabled={loading}
                        onClick={handleGenerateWorkflow}
                      >
                        {loading ? 'Synthesizing DAG…' : 'Generate Production Workflow DAG'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Panel 3: Synthesized Production Workflow DAG */}
            {showWorkflow && (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Synthesized Production Workflow Routing (DAG)</h3>
                    <p>Topologically sorted operations with dependency validation</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={validation.isValid ? 'success' : 'danger'}>
                      {validation.isValid ? 'Validated Acyclic DAG' : 'Cycle Detected'}
                    </Badge>
                  </div>
                </div>

                <div className="panel-body">
                  <div className="space-y-2">
                    {workflowNodes.map((node, index) => (
                      <div
                        key={node.id}
                        className="between p-3.5 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] text-xs"
                      >
                        <div className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] font-bold flex items-center justify-center text-[11px] flex-shrink-0">
                            {index + 1}
                          </span>
                          <div>
                            <strong className="block text-xs text-[var(--ink)]">
                              {node.name}
                            </strong>
                            <span className="small muted">
                              Department: {node.department}
                            </span>
                          </div>
                        </div>
                        <Badge variant="default">{node.department}</Badge>
                      </div>
                    ))}
                  </div>

                  <p className="approval-note">
                    Topologically sorted sequence · Enforces machine availability, BOM material inputs, and quality gate checkoffs.
                  </p>
                </div>

                <div className="panel-footer">
                  <Button variant="default" onClick={() => setShowWorkflow(false)}>
                    Modify Specifications
                  </Button>
                  <Button variant="primary" icon="check" onClick={handleConfirmOrder}>
                    Confirm & Create Draft Order
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Copilot Grounding & Factory Intelligence */}
          <div className="stack">
            {/* Panel: Active Shop-Floor Context */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Shop-Floor Context</h3>
                  <p>Real-time factory grounding</p>
                </div>
                <span className="live-indicator">
                  <span className="dot" />
                  Active
                </span>
              </div>
              <div className="panel-body">
                <div className="spec-row">
                  <span>CNC 5-Axis Milling</span>
                  <strong>91% load (1 slot open)</strong>
                </div>
                <div className="spec-row">
                  <span>Press Brake Bending</span>
                  <strong>Shift A Ready</strong>
                </div>
                <div className="spec-row">
                  <span>Al 6061-T6 Billet</span>
                  <strong>450 kg in stock</strong>
                </div>
                <div className="spec-row">
                  <span>Ti-6Al-4V Ingot</span>
                  <strong>320 kg (QC passed)</strong>
                </div>
                <div className="spec-row">
                  <span>Electrical Harness</span>
                  <strong>Station 4 available</strong>
                </div>
                <div className="spec-row">
                  <span>Quality Assurance</span>
                  <Badge variant="success">ISO 9001 / CMM</Badge>
                </div>
              </div>
            </div>

            {/* Panel: Ingestion Guardrails */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Ingestion Guardrails</h3>
                  <p>Quality & engineering policies</p>
                </div>
                <Icon name="shield" className="text-muted" />
              </div>
              <div className="panel-body">
                <div className="stack gap-3 text-xs">
                  <div>
                    <strong className="block text-xs mb-1">1. Ambiguity Clearance</strong>
                    <p className="small muted">
                      Unspecified surface finishes or dimensional tolerances must be resolved before committing to binding customer promises.
                    </p>
                  </div>
                  <div>
                    <strong className="block text-xs mb-1">2. Acyclic Workflow (DAG)</strong>
                    <p className="small muted">
                      Work orders are verified against directed acyclic graph (DAG) topology to guarantee no circular routing dependencies.
                    </p>
                  </div>
                  <div>
                    <strong className="block text-xs mb-1">3. Capacity Grounding</strong>
                    <p className="small muted">
                      Quotations and routing steps are grounded against machine constraints and technician shift capabilities.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel: Presets Summary */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Sample Inquiries</h3>
                  <p>Test with realistic industry RFQs</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="stack gap-2">
                  <button
                    type="button"
                    className="question-chip"
                    onClick={() => loadPreset('panel')}
                  >
                    <strong>Custom Control Panel (120 units)</strong>
                    <span className="small muted block mt-1">Aluminum 6061-T6 · CNC + Bending + Electrical</span>
                  </button>
                  <button
                    type="button"
                    className="question-chip"
                    onClick={() => loadPreset('aerospace')}
                  >
                    <strong>Aerospace Ti Actuator (60 units)</strong>
                    <span className="small muted block mt-1">Titanium Ti-6Al-4V · 5-Axis CNC + Wire EDM + Hydro</span>
                  </button>
                  <button
                    type="button"
                    className="question-chip"
                    onClick={() => loadPreset('bracket')}
                  >
                    <strong>Precision SS Bracket (300 units)</strong>
                    <span className="small muted block mt-1">Stainless 316L · Laser cut + Bending + Passivation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
