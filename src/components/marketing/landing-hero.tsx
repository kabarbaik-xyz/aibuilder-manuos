'use client';

import React from 'react';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

export function LandingHero() {
  return (
    <section className="l-hero" aria-labelledby="hero-heading">
      <div className="l-hero-header">
        <div className="l-pill-badge">
          <Icon name="spark" className="w-4 h-4 text-primary" />
          <span>Enterprise Make-to-Order Manufacturing OS</span>
        </div>

        <h1 id="hero-heading" className="l-hero-title">
          From custom RFQ to serialized delivery,{' '}
          <span className="l-hero-title-gradient">engineered for zero shop-floor blind spots.</span>
        </h1>

        <p className="l-hero-desc">
          Replace disconnected spreadsheets, paper travellers, and legacy ERP workarounds with one unified operating system.
          ManuOS locks engineering revisions, enforces mass-conserved shop floor execution, reconciles every inventory lot in real time,
          and protects delivery margins with human-governed AI recovery.
        </p>

        <div className="l-hero-actions">
          <ButtonLink
            href="/demo"
            variant="primary"
            id="hero-demo-button"
            className="flex items-center gap-2"
          >
            <span>Launch Interactive Demo</span>
            <Icon name="arrow" className="w-4 h-4" />
          </ButtonLink>
          <ButtonLink
            href="/login"
            variant="default"
            id="hero-signin-button"
          >
            Sign In to Workspace
          </ButtonLink>
          <a
            href="#flow"
            className="btn ghost text-muted hover:text-ink"
            id="hero-architecture-link"
          >
            Explore 8-Stage Lifecycle
          </a>
        </div>

        {/* Enterprise Value & Architectural Guarantees */}
        <div className="l-hero-proof-chips" aria-label="System Guarantees">
          <div className="l-proof-item">
            <Icon name="check" />
            <span><strong>100% Mass Conservation</strong> across output, rework &amp; scrap</span>
          </div>
          <div className="l-proof-item">
            <Icon name="check" />
            <span><strong>Double-Entry</strong> real-time inventory &amp; lot ledger</span>
          </div>
          <div className="l-proof-item">
            <Icon name="check" />
            <span><strong>Tamper-Evident</strong> append-only compliance audit trail</span>
          </div>
          <div className="l-proof-item">
            <Icon name="check" />
            <span><strong>Human-Governed</strong> AI schedule recovery</span>
          </div>
        </div>
      </div>

      {/* High-Fidelity Light Theme Workspace Window Preview */}
      <div className="l-window-frame" aria-label="ManuOS Command Center Interface Preview">
        <div className="l-window-topbar">
          <div className="l-window-dots" aria-hidden="true">
            <span className="l-window-dot bg-red-300" />
            <span className="l-window-dot bg-amber-300" />
            <span className="l-window-dot bg-emerald-300" />
          </div>
          <div className="l-window-url-bar" aria-label="Current Workspace URL">
            <Icon name="lock" className="w-3.5 h-3.5 text-muted" />
            <span>app.manuos.internal/orders/MO-2026-8812</span>
          </div>
          <div className="l-window-status-pill">
            <span>Authoritative State Active</span>
          </div>
        </div>

        <div className="l-window-body">
          {/* Key Metric Cards */}
          <div className="l-dash-stats">
            <div className="l-dash-card">
              <span className="l-dash-card-label">Active Order</span>
              <span className="l-dash-card-val text-primary">MO-2026-8812</span>
              <span className="l-dash-card-sub">
                <Icon name="user" className="w-3 h-3" /> AeroDynamics Corp · Servo Mount
              </span>
            </div>
            <div className="l-dash-card">
              <span className="l-dash-card-label">Quantity Atoms</span>
              <span className="l-dash-card-val">120,000,000</span>
              <span className="l-dash-card-sub">
                <Icon name="ruler" className="w-3 h-3" /> 120 Units (Display scale 10⁶)
              </span>
            </div>
            <div className="l-dash-card">
              <span className="l-dash-card-label">Inspection Progress</span>
              <span className="l-dash-card-val text-emerald-700">78 / 120</span>
              <span className="l-dash-card-sub">
                <Icon name="checklist" className="w-3 h-3 text-emerald-600" /> 65% QC Passed · 4 Rework · 2 Scrap
              </span>
            </div>
            <div className="l-dash-card">
              <span className="l-dash-card-label">Ledger Invariant</span>
              <span className="l-dash-card-val text-blue-700">Reconciled</span>
              <span className="l-dash-card-sub">
                <Icon name="shield" className="w-3 h-3 text-blue-600" /> 0 discrepancies across movements
              </span>
            </div>
          </div>

          {/* Detailed Workflow & Execution Snapshot */}
          <div className="l-dash-split">
            <div className="l-dash-panel">
              <div className="l-dash-panel-header">
                <span className="l-dash-panel-title">
                  <Icon name="route" className="w-4 h-4 text-primary" />
                  Live Directed Acyclic Graph (DAG) Execution
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Version Rev B (Pinned)
                </span>
              </div>

              <div className="l-order-flow-preview">
                <div className="l-flow-step-row">
                  <div className="l-flow-step-name">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs grid place-items-center">
                      ✓
                    </span>
                    <div>
                      <div className="font-semibold text-ink">OP-10: CNC Laser Profiling</div>
                      <div className="text-xs text-muted">Machine: TRUMPF-5030 · Material: AL-6061-T6 (Batch #B928)</div>
                    </div>
                  </div>
                  <span className="l-flow-step-badge bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Completed (120/120)
                  </span>
                </div>

                <div className="l-flow-step-row">
                  <div className="l-flow-step-name">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs grid place-items-center">
                      2
                    </span>
                    <div>
                      <div className="font-semibold text-ink">OP-20: CNC 5-Axis Milling</div>
                      <div className="text-xs text-muted">Machine: DMG-MORI-50 · Technician: David Kim (Cert: Level 3)</div>
                    </div>
                  </div>
                  <span className="l-flow-step-badge bg-blue-50 text-primary border border-blue-200">
                    In Progress (82/120)
                  </span>
                </div>

                <div className="l-flow-step-row">
                  <div className="l-flow-step-name">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-xs grid place-items-center">
                      3
                    </span>
                    <div>
                      <div className="font-semibold text-ink">QC-30: Dimensional & Caliper Inspection</div>
                      <div className="text-xs text-muted">Checklist: CL-AERO-01 · Signoff Guard Active</div>
                    </div>
                  </div>
                  <span className="l-flow-step-badge bg-slate-100 text-slate-700 border border-slate-200">
                    Awaiting Predecessor
                  </span>
                </div>
              </div>
            </div>

            <div className="l-dash-panel flex flex-col justify-between">
              <div>
                <div className="l-dash-panel-header">
                  <span className="l-dash-panel-title">
                    <Icon name="spark" className="w-4 h-4 text-primary" />
                    CoreAI Risk & Recovery
                  </span>
                </div>
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs leading-relaxed text-amber-900 mb-3">
                  <strong>Schedule Variance Detected:</strong> CNC Milling is 42 mins behind planned cycle. Recovery proposal generated: shift 20 remaining units to secondary station TR-02.
                </div>
                <div className="text-xs text-muted leading-relaxed">
                  <em>Invariant rule:</em> No changes are auto-committed. Requires explicit confirmation by Shop Floor Supervisor.
                </div>
              </div>

              <div className="pt-4 border-t border-line flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Proposal Status:</span>
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-md">
                  Awaiting Human Approval
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
