'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

interface FlowStage {
  step: string;
  phase: string;
  title: string;
  tagline: string;
  icon: IconName;
  route: string;
  summary: string;
  chips: string[];
  impact: string;
  metric: string;
}

const FLOW_STAGES: FlowStage[] = [
  {
    step: '01',
    phase: 'Commercial',
    title: 'Order Intake & Commitments',
    tagline: 'Quote-to-Order Without Spec Drift',
    icon: 'order',
    route: '/orders/intake',
    summary: 'Review customer specifications, quantities, and requested dates before the engineering handoff.',
    chips: ['RFQ & Drawing Capture', 'Feasibility Check', 'Tenant Isolation'],
    impact: 'Review specifications before handoff',
    metric: 'Reviewed Inputs',
  },
  {
    step: '02',
    phase: 'Engineering',
    title: 'Engineering & BOM Revisions',
    tagline: 'Revision-Locked DAG Workflows',
    icon: 'engineering',
    route: '/engineering',
    summary: 'Build visual routing graphs and govern Engineering Change Orders (ECOs) with version control.',
    chips: ['Visual DAG Routing', 'Controlled ECO Diffs', 'Draft Isolation'],
    impact: 'Keep released work linked to its revision',
    metric: 'Pinned Revisions',
  },
  {
    step: '03',
    phase: 'Release',
    title: 'Order Release & Dispatch',
    tagline: 'Approved Orders Become Production Work',
    icon: 'route',
    route: '/orders',
    summary: 'Release approved orders into production tasks and review material reservations.',
    chips: ['Material Reservations', 'Station Jobsheets', 'Atomic Dispatch'],
    impact: 'Connect approved orders to production tasks',
    metric: 'Controlled Release',
  },
  {
    step: '04',
    phase: 'Planning',
    title: 'Finite Capacity & Roster',
    tagline: 'Conflict-Free Machine & Skill Scheduling',
    icon: 'calendar',
    route: '/planning',
    summary: 'Schedule against real machine calendars and verified technician certifications.',
    chips: ['Capacity Checks', 'Skill & Cert Gate', 'Shift Swap Control'],
    impact: 'Validate bookings before assignment',
    metric: 'Qualification Checks',
  },
  {
    step: '05',
    phase: 'Execution',
    title: 'Shop Floor Workstations',
    tagline: 'Touch-First Operator Cockpit',
    icon: 'work',
    route: '/shop-floor',
    summary: 'Review station queues, pinned instructions, and recorded production quantities.',
    chips: ['Touch Station Queue', 'Pass / Rework / Scrap', 'Overproduction Guard'],
    impact: 'Record output and quality dispositions',
    metric: 'Mass Conserved',
  },
  {
    step: '06',
    phase: 'Quality',
    title: 'Quality Gates & Containment',
    tagline: 'Digital Checklists & Rework Loops',
    icon: 'checklist',
    route: '/quality/inspections',
    summary: 'Mandatory inspection sign-offs and closed-loop containment for non-conforming lots.',
    chips: ['Hard Sign-Off Gate', 'NCR Quarantine', 'Reinspection Loop'],
    impact: 'Keep held stock separate from passed stock',
    metric: 'Gated Release',
  },
  {
    step: '07',
    phase: 'Fulfillment',
    title: 'Lot Allocation & Dispatch',
    tagline: 'Verified Packing & Ledger Deduction',
    icon: 'delivery',
    route: '/delivery/shipments',
    summary: 'Allocate from eligible QC-passed stock and post dispatch movements to the inventory ledger.',
    chips: ['QC-Passed Lot Pick', 'Manifest Generation', 'Auto Ledger Post'],
    impact: 'Link dispatched quantities to stock movements',
    metric: 'Ledger-Linked Dispatch',
  },
  {
    step: '08',
    phase: 'Passport',
    title: 'Digital Product Passport',
    tagline: 'Recorded Production Genealogy',
    icon: 'shield',
    route: '/portal/orders',
    summary: 'Review recorded lot and serial genealogy alongside available quality evidence and passport records.',
    chips: ['Lot-to-Serial Genealogy', 'Quality Evidence', 'Buyer Self-Service'],
    impact: 'Give customers access to available traceability records',
    metric: 'Linked Evidence',
  },
];

export function LandingFlow() {
  const [activeStep, setActiveStep] = useState<string>('01');
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        const idx = FLOW_STAGES.findIndex((s) => s.step === prev);
        const nextIdx = (idx + 1) % FLOW_STAGES.length;
        return FLOW_STAGES[nextIdx].step;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [paused]);

  const selectedStage = FLOW_STAGES.find((s) => s.step === activeStep) ?? FLOW_STAGES[0];

  return (
    <section
      id="flow"
      className="l-section l-section-alt"
      aria-labelledby="flow-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">End-to-End Orchestration</span>
          <h2 id="flow-heading" className="l-section-title">
            Connected operations give CoreAI useful context.
          </h2>
          <p className="l-section-desc">
            Orders, engineering, planning, execution, and delivery share records your team can inspect and act on.
          </p>
        </div>

        {/* Auto-Advancing Pipeline Stepper */}
        <div className="l-flow-pipeline-bar" role="group" aria-label="Manufacturing Lifecycle Stages">
          {FLOW_STAGES.map((stage, idx) => {
            const isActive = stage.step === activeStep;
            return (
              <React.Fragment key={stage.step}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveStep(stage.step)}
                  className={`l-flow-pill ${isActive ? 'active' : ''}`}
                >
                  <span className="l-flow-pill-num">{stage.step}</span>
                  <span className="l-flow-pill-label">{stage.phase}</span>
                  {isActive && !paused && <span className="l-flow-pill-progress" aria-hidden="true" />}
                </button>
                {idx < FLOW_STAGES.length - 1 && (
                  <span className="l-flow-connector" aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Sleek Animated Spotlight Bar */}
        <div key={selectedStage.step} className="l-flow-spotlight l-anim-fade-in" aria-live="polite">
          <div className="l-flow-spotlight-main">
            <div className="l-flow-spotlight-badge-row">
              <span className="l-stage-card-num">STAGE {selectedStage.step} · {selectedStage.phase.toUpperCase()}</span>
              <span className="l-flow-spotlight-tagline">{selectedStage.tagline}</span>
            </div>
            <h3 className="l-flow-spotlight-title">{selectedStage.title}</h3>
            <p className="l-flow-spotlight-desc">{selectedStage.summary}</p>
            <div className="l-flow-spotlight-footer">
              <div className="l-flow-spotlight-outcome">
                <Icon name="check" className="w-4 h-4 text-emerald-600" />
                <span><strong>Outcome:</strong> {selectedStage.impact}</span>
              </div>
              <Link href={selectedStage.route} className="l-flow-spotlight-link">
                <span>Open {selectedStage.phase}</span>
                <Icon name="arrow" className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="l-flow-spotlight-points">
            <div className="flex items-center justify-between">
              <span className="l-flow-spotlight-points-title">Core Capabilities</span>
              <span className="text-xs font-bold text-primary bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                {selectedStage.metric}
              </span>
            </div>
            <div className="l-flow-chip-grid">
              {selectedStage.chips.map((chip) => (
                <div key={chip} className="l-flow-cap-chip">
                  <span className="l-flow-point-check" aria-hidden="true">✓</span>
                  <span>{chip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scannable 8-Stage Bento Grid (No Wall of Text!) */}
        <div className="l-stage-grid">
          {FLOW_STAGES.map((stage) => {
            const isSelected = stage.step === activeStep;
            return (
              <article
                key={stage.step}
                onClick={() => setActiveStep(stage.step)}
                className={`l-stage-card ${isSelected ? 'is-selected' : ''}`}
              >
                <div className="l-stage-card-top">
                  <div className="l-stage-icon-box" aria-hidden="true">
                    <Icon name={stage.icon} className="w-5 h-5" />
                  </div>
                  <div className="l-stage-meta">
                    <span className="l-stage-card-num">STAGE {stage.step}</span>
                    <span className="l-stage-phase-label">{stage.phase}</span>
                  </div>
                </div>

                <h3 className="l-stage-title">{stage.title}</h3>
                <p className="l-stage-desc">{stage.summary}</p>

                <div className="l-stage-tags">
                  {stage.chips.map((chip) => (
                    <span key={chip} className="l-stage-tag-pill">
                      {chip}
                    </span>
                  ))}
                </div>

                <div className="l-stage-outcome-box">
                  <Icon name="check" className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="l-stage-outcome-text">{stage.impact}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
