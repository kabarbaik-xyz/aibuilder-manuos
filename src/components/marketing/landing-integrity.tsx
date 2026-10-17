'use client';

import React from 'react';
import { Icon, type IconName } from '@/components/icons';

interface IntegrityPillar {
  badge: string;
  title: string;
  icon: IconName;
  metricValue: string;
  metricLabel: string;
  equation: string;
  summary: string;
  tags: string[];
  outcome: string;
}

const INTEGRITY_PILLARS: IntegrityPillar[] = [
  {
    badge: 'MASS CONSERVATION',
    title: 'Zero Material & Scrap Leakage',
    icon: 'ruler',
    metricValue: '100%',
    metricLabel: 'WIP Accounted',
    equation: 'Output = Passed + Rework + Scrap',
    summary: 'Every unit issued to the shop floor must be accounted for before an operation can close.',
    tags: ['10⁶ Integer Precision', 'No Double-Counted Rework', 'Overproduction Guard'],
    outcome: 'Eliminates hidden scrap & surprise write-offs',
  },
  {
    badge: 'DOUBLE-ENTRY LEDGER',
    title: 'Financial-Grade Stock Accounting',
    icon: 'box',
    metricValue: '0',
    metricLabel: 'Phantom Stock',
    equation: 'Available = Receipts − WIP − Shipped',
    summary: 'Every physical transfer posts balanced debit and credit entries with non-negative stock guards.',
    tags: ['Dual Debit/Credit Ledger', 'Zero Negative Balances', 'Quarantine Ring-Fencing'],
    outcome: 'Perpetual stock accuracy in real time',
  },
  {
    badge: 'FAULT TOLERANCE',
    title: 'Replay-Safe Floor Execution',
    icon: 'lock',
    metricValue: '0%',
    metricLabel: 'Duplicate Commits',
    equation: 'Network Retry → Single State Commit',
    summary: 'Idempotent command protection ensures unstable factory Wi-Fi or double-taps never duplicate work.',
    tags: ['Idempotent Commands', 'Atomic Rollback', 'Offline Mutation Guard'],
    outcome: 'Reliable data capture in harsh floor environments',
  },
  {
    badge: 'TAMPER-EVIDENT AUDIT',
    title: 'Write-Once Genealogy Ledger',
    icon: 'shield',
    metricValue: '100%',
    metricLabel: 'Immutable History',
    equation: 'Audit Events = Append-Only & Locked',
    summary: 'Write-once event logs lock every engineering change, operator sign-off, and material lot movement.',
    tags: ['Write-Once Event Store', 'Lot-to-Serial Genealogy', 'Digital CoC Export'],
    outcome: 'Instant end-to-end production traceability',
  },
];

const LEDGER_FLOW_NODES = [
  { label: 'Raw Lot Receipt', status: '+500.00 kg Verified', tone: 'blue' },
  { label: 'WIP Reservation', status: '−120.00 kg Allocated', tone: 'blue' },
  { label: 'Floor & QC Gate', status: '114 Pass · 4 Rework · 2 Scrap', tone: 'amber' },
  { label: 'Verified Dispatch', status: '118 Shipped + Passport', tone: 'emerald' },
];

export function LandingIntegrity() {
  return (
    <section id="architecture" className="l-section l-section-alt" aria-labelledby="integrity-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">Zero-Leakage Operational Control</span>
          <h2 id="integrity-heading" className="l-section-title">
            Financial-grade accounting for physical manufacturing.
          </h2>
          <p className="l-section-desc">
            Every gram of raw material, rework loop, and customer shipment is reconciled automatically.
          </p>
        </div>

        {/* Animated Continuous Ledger Ribbon */}
        <div className="l-ledger-ribbon" aria-label="Continuous Material & Mass Reconciliation Flow">
          <div className="l-ledger-ribbon-head">
            <div className="l-ledger-ribbon-title">
              <span className="l-live-pulse-dot" aria-hidden="true" />
              <span>Live Mass &amp; Inventory Reconciliation Stream</span>
            </div>
            <span className="l-ledger-ribbon-badge">0 Unexplained Discrepancies</span>
          </div>
          <div className="l-ledger-ribbon-steps">
            {LEDGER_FLOW_NODES.map((node, idx) => (
              <React.Fragment key={node.label}>
                <div className="l-ledger-node">
                  <span className="l-ledger-node-step">0{idx + 1}</span>
                  <div>
                    <div className="l-ledger-node-label">{node.label}</div>
                    <div className={`l-ledger-node-status tone-${node.tone}`}>{node.status}</div>
                  </div>
                </div>
                {idx < LEDGER_FLOW_NODES.length - 1 && (
                  <div className="l-ledger-arrow-pulse hidden lg:flex" aria-hidden="true">
                    <Icon name="arrow" className="w-4 h-4 text-primary" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 4 Concise, Visual Pillar Cards */}
        <div className="l-integrity-grid">
          {INTEGRITY_PILLARS.map((pillar) => (
            <article key={pillar.title} className="l-integrity-card">
              <div className="l-integrity-card-header">
                <div className="l-integrity-top">
                  <div className="l-integrity-icon" aria-hidden="true">
                    <Icon name={pillar.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="l-integrity-badge">{pillar.badge}</span>
                    <h3 className="l-integrity-title">{pillar.title}</h3>
                  </div>
                </div>

                <div className="l-integrity-metric-box">
                  <span className="l-integrity-metric-val">{pillar.metricValue}</span>
                  <span className="l-integrity-metric-lbl">{pillar.metricLabel}</span>
                </div>
              </div>

              <p className="l-integrity-desc">{pillar.summary}</p>

              <div className="l-integrity-rule-banner">
                <span className="l-integrity-rule-eq">{pillar.equation}</span>
              </div>

              <div className="l-stage-tags">
                {pillar.tags.map((tag) => (
                  <span key={tag} className="l-stage-tag-pill">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="l-integrity-outcome">
                <Icon name="check" className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{pillar.outcome}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
