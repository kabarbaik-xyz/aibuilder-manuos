'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

interface AIScenario {
  id: string;
  label: string;
  badge: string;
  icon: IconName;
  orderRef: string;
  customer: string;
  triggerTitle: string;
  cpmSummary: string;
  recommendedAction: string;
  metrics: {
    promiseImpact: string;
    marginImpact: string;
    gateStatus: string;
  };
  approverRole: string;
  workspaceHref: string;
}

const AI_SCENARIOS: AIScenario[] = [
  {
    id: 'bottleneck',
    label: 'Machine Bottleneck Recovery',
    badge: 'SCHEDULE DRIFT',
    icon: 'clock',
    orderRef: 'MO-2026-8812 · Servo Mount',
    customer: 'AeroDynamics Corp',
    triggerTitle: 'OP-20 5-Axis Milling delayed 45m — Friday delivery at risk.',
    cpmSummary: 'Parallel station CNC-02 has 3.5h open capacity on Shift B with 2 certified Level-3 operators.',
    recommendedAction: 'Split 40 units to parallel station CNC-02 to preserve Friday 16:00 delivery (+1.4h buffer).',
    metrics: {
      promiseImpact: '+1.4h Slack Saved',
      marginImpact: '99.4% Margin Kept',
      gateStatus: 'Cert L3 Verified',
    },
    approverRole: 'Production Planner',
    workspaceHref: '/planning',
  },
  {
    id: 'material',
    label: 'Authorized Alloy Substitution',
    badge: 'MATERIAL HOLD',
    icon: 'box',
    orderRef: 'MO-2026-8840 · Valve Body',
    customer: 'Pacific Marine',
    triggerTitle: 'Primary bar stock Lot #AL-904 quarantined at receiving.',
    cpmSummary: '85 kg of ECO-authorized substitute alloy Lot #AL-911 is available in Bay A-04.',
    recommendedAction: 'Allocate 30 kg from approved substitute Lot #AL-911 under ECO-104 and release OP-10.',
    metrics: {
      promiseImpact: '0 Days Slip',
      marginImpact: '−$42 Variance',
      gateStatus: 'ECO-104 Approved',
    },
    approverRole: 'Lead Engineer',
    workspaceHref: '/engineering',
  },
  {
    id: 'quality',
    label: 'QC Containment & Rework',
    badge: 'QC CONTAINMENT',
    icon: 'checklist',
    orderRef: 'MO-2026-8855 · Optical Housing',
    customer: 'Vanguard Photonics',
    triggerTitle: '6 of 50 units flagged for +0.02mm bore deviation at QC-30.',
    cpmSummary: '44 passed units cleared for staging; Station HONE-01 available for immediate rework.',
    recommendedAction: 'Route 6 held units to HONE-01 for sleeve rework; release 44 passed units to packing.',
    metrics: {
      promiseImpact: 'Full 50 Units Met',
      marginImpact: '$1,420 Scrap Saved',
      gateStatus: 'QC Gate Armed',
    },
    approverRole: 'Quality Manager',
    workspaceHref: '/quality/inspections',
  },
];

export function LandingAI() {
  const [activeId, setActiveId] = useState<string>(AI_SCENARIOS[0].id);
  const scenario = AI_SCENARIOS.find((s) => s.id === activeId) ?? AI_SCENARIOS[0];

  return (
    <section id="ai-governance" className="l-section" aria-labelledby="ai-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">Human-Governed Operational Intelligence</span>
          <h2 id="ai-heading" className="l-section-title">
            Deterministic engines calculate. CoreAI proposes. Humans decide.
          </h2>
          <p className="l-section-desc">
            Exact math computes capacity and critical paths. CoreAI drafts recovery options. Supervisors approve every change.
          </p>
        </div>

        {/* 3 Concise Governance Steps */}
        <div className="l-ai-pillars-row">
          <div className="l-ai-pillar-card">
            <div className="l-ai-pillar-top">
              <span className="l-ai-pillar-num">01 · CALCULATE</span>
              <h3 className="l-ai-pillar-title">Deterministic Math First</h3>
            </div>
            <p className="l-ai-pillar-desc">
              CPM critical paths, machine calendars, and stock balances are computed with exact math—never guessed.
            </p>
          </div>
          <div className="l-ai-pillar-card">
            <div className="l-ai-pillar-top">
              <span className="l-ai-pillar-num">02 · PROPOSE</span>
              <h3 className="l-ai-pillar-title">Explainable AI Options</h3>
            </div>
            <p className="l-ai-pillar-desc">
              CoreAI simulates valid recovery paths and quantifies delivery, cost, and resource trade-offs.
            </p>
          </div>
          <div className="l-ai-pillar-card">
            <div className="l-ai-pillar-top">
              <span className="l-ai-pillar-num">03 · DECIDE</span>
              <h3 className="l-ai-pillar-title">Human Supervisor Gate</h3>
            </div>
            <p className="l-ai-pillar-desc">
              Zero silent auto-commits. Every schedule shift or substitution requires explicit human approval.
            </p>
          </div>
        </div>

        {/* Interactive AI Recovery Showcase */}
        <div className="l-ai-showcase">
          <div className="l-ai-showcase-left">
            <div className="l-ai-badge">
              <span className="l-live-pulse-dot blue" aria-hidden="true" />
              <span>Interactive Recovery Playbooks</span>
            </div>

            <h3 className="l-ai-showcase-heading">
              Turn floor disruptions into 1-click recovery decisions.
            </h3>
            <p className="l-ai-showcase-sub">
              Click a live disruption scenario to inspect how CoreAI prepares a verified recovery plan:
            </p>

            <div className="l-ai-scenario-tabs" role="tablist" aria-label="Disruption Recovery Scenarios">
              {AI_SCENARIOS.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveId(item.id)}
                    className={`l-ai-scenario-btn ${isActive ? 'active' : ''}`}
                  >
                    <div className="l-ai-scenario-btn-icon">
                      <Icon name={item.icon} className="w-4 h-4" />
                    </div>
                    <div className="l-ai-scenario-btn-copy">
                      <span className="l-ai-scenario-btn-tag">{item.badge}</span>
                      <strong>{item.label}</strong>
                    </div>
                    <Icon name="chevron" className="w-4 h-4 ml-auto text-muted" />
                  </button>
                );
              })}
            </div>

            <div className="l-stage-tags">
              <span className="l-stage-tag-pill">Read-Only AI Context</span>
              <span className="l-stage-tag-pill">Pre-Validated Constraints</span>
              <span className="l-stage-tag-pill">Signed Audit Trail</span>
            </div>
          </div>

          {/* Right: Animated Decision Console */}
          <div key={scenario.id} className="l-ai-console l-anim-fade-in" aria-live="polite">
            <div className="l-ai-console-topbar">
              <div className="flex items-center gap-2">
                <span className="l-live-pulse-dot amber" aria-hidden="true" />
                <span className="text-xs font-bold text-ink">CoreAI Recovery Copilot</span>
              </div>
              <span className="l-ai-console-pill">{scenario.badge}</span>
            </div>

            <div className="l-ai-console-body">
              <div className="l-ai-console-order-bar">
                <div>
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted block">Active Order</span>
                  <strong className="text-sm text-ink">{scenario.orderRef}</strong>
                </div>
                <div className="text-right">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted block">Customer</span>
                  <span className="text-xs font-semibold text-primary">{scenario.customer}</span>
                </div>
              </div>

              <div className="l-ai-console-block alert">
                <div className="l-ai-console-block-head">
                  <Icon name="alert" className="w-4 h-4 text-amber-700" />
                  <span>Exception Detected</span>
                </div>
                <p>{scenario.triggerTitle}</p>
              </div>

              <div className="l-ai-console-block neutral">
                <div className="l-ai-console-block-head">
                  <Icon name="network" className="w-4 h-4 text-primary" />
                  <span>Deterministic Constraint Check</span>
                </div>
                <p>{scenario.cpmSummary}</p>
              </div>

              <div className="l-ai-console-block proposal">
                <div className="l-ai-console-block-head">
                  <Icon name="spark" className="w-4 h-4 text-emerald-700" />
                  <span>Recommended Recovery Action</span>
                </div>
                <p className="font-semibold text-ink">{scenario.recommendedAction}</p>
              </div>

              <div className="l-ai-console-metrics">
                <div className="l-ai-metric-chip">
                  <span>Delivery Impact</span>
                  <strong className="text-emerald-700">{scenario.metrics.promiseImpact}</strong>
                </div>
                <div className="l-ai-metric-chip">
                  <span>Margin Impact</span>
                  <strong>{scenario.metrics.marginImpact}</strong>
                </div>
                <div className="l-ai-metric-chip">
                  <span>Validation</span>
                  <strong className="text-primary">{scenario.metrics.gateStatus}</strong>
                </div>
              </div>
            </div>

            <div className="l-ai-console-footer">
              <div className="text-xs text-muted">
                Requires: <strong className="text-ink">{scenario.approverRole}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Link href={scenario.workspaceHref} className="btn small-btn">
                  Inspect View
                </Link>
                <Link href="/demo" className="btn primary small-btn">
                  <span>Try in Demo</span>
                  <Icon name="arrow" className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
