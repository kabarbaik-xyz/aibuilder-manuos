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
    title: 'Track Output, Rework & Scrap',
    icon: 'ruler',
    metricValue: 'Tracked',
    metricLabel: 'Production Quantities',
    equation: 'Inspected = Passed + Rework + Scrap',
    summary: 'Inspection dispositions account for passed, rework, and scrapped quantities; reinspection reclassifies existing held stock.',
    tags: ['10⁶ Integer Precision', 'No Double-Counted Rework', 'Overproduction Guard'],
    outcome: 'Keep recorded dispositions traceable',
  },
  {
    badge: 'DOUBLE-ENTRY LEDGER',
    title: 'Balanced Inventory Movements',
    icon: 'box',
    metricValue: 'Balanced',
    metricLabel: 'Ledger Entries',
    equation: 'Source → Movement → Destination',
    summary: 'Every physical transfer posts balanced debit and credit entries with non-negative stock guards.',
    tags: ['Dual Debit/Credit Ledger', 'Zero Negative Balances', 'Quarantine Ring-Fencing'],
    outcome: 'Trace stock changes to their movements',
  },
  {
    badge: 'FAULT TOLERANCE',
    title: 'Replay-Safe Floor Execution',
    icon: 'lock',
    metricValue: 'Retry-safe',
    metricLabel: 'Commands',
    equation: 'Network Retry → Single State Commit',
    summary: 'Idempotency protection covers supported commands against repeated requests with the same idempotency key.',
    tags: ['Idempotent Commands', 'Atomic Rollback', 'Command Validation'],
    outcome: 'Review command outcomes and recorded changes',
  },
  {
    badge: 'TRACEABLE RECORDS',
    title: 'Protected Audit History',
    icon: 'shield',
    metricValue: 'Tracked',
    metricLabel: 'Audit Events',
    equation: 'Commands → Audit Events',
    summary: 'Append-only audit events record supported domain commands; passport snapshots preserve captured traceability evidence.',
    tags: ['Write-Once Event Store', 'Lot-to-Serial Genealogy', 'Passport Snapshots'],
    outcome: 'Inspect available production evidence',
  },
];

const LEDGER_FLOW_NODES = [
  { label: 'Raw Lot Receipt', status: 'Receipt recorded', tone: 'blue' },
  { label: 'WIP Reservation', status: 'Material reserved', tone: 'blue' },
  { label: 'Floor & QC Gate', status: 'Dispositions recorded', tone: 'amber' },
  { label: 'Verified Dispatch', status: 'Dispatch linked to stock', tone: 'emerald' },
];

export function LandingIntegrity() {
  return (
    <section id="architecture" className="l-section l-section-alt" aria-labelledby="integrity-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">The foundation behind CoreAI</span>
          <h2 id="integrity-heading" className="l-section-title">
            Useful intelligence starts with traceable records.
          </h2>
          <p className="l-section-desc">
            Recorded quantities, balanced stock movements, and protected audit events give your team a foundation for operational review.
          </p>
        </div>

        {/* Animated Continuous Ledger Ribbon */}
        <div className="l-ledger-ribbon" aria-label="Illustrative inventory movement flow">
          <div className="l-ledger-ribbon-head">
            <div className="l-ledger-ribbon-title">
              <span className="l-live-pulse-dot" aria-hidden="true" />
              <span>Illustrative inventory movement flow</span>
            </div>
            <span className="l-ledger-ribbon-badge">Example records</span>
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
