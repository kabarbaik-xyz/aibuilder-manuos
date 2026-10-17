'use client';

import React from 'react';
import { Icon, type IconName } from '@/components/icons';

interface FlowStage {
  step: string;
  title: string;
  icon: IconName;
  route: string;
  description: string;
  guarantee: string;
}

const FLOW_STAGES: FlowStage[] = [
  {
    step: '01',
    title: 'Order Intake & Commitments',
    icon: 'order',
    route: '/orders/intake',
    description: 'Capture RFQs, customer specifications, and engineering requirements with integer-safe quantity commitments.',
    guarantee: 'Zero decimal precision loss; customer tenant isolation.',
  },
  {
    step: '02',
    title: 'Engineering & BOM Revisions',
    icon: 'engineering',
    route: '/engineering',
    description: 'Manage versioned Bills of Materials, Engineering Change Orders (ECO), and authorized component substitutions.',
    guarantee: 'Immutably published routing DAGs; draft revision isolation.',
  },
  {
    step: '03',
    title: 'Release & DAG Instantiation',
    icon: 'route',
    route: '/orders',
    description: 'Execute atomic release transactions instantiating Manufacturing Orders, jobsheets, and dependency graphs.',
    guarantee: 'Version-pinned workflow instantiation in a single DB transaction.',
  },
  {
    step: '04',
    title: 'Planning & Published Schedules',
    icon: 'calendar',
    route: '/planning',
    description: 'Finite capacity scheduling against machine calendar constraints and verified operator skill/certification rosters.',
    guarantee: 'No double-booking; immutable published schedule revisions.',
  },
  {
    step: '05',
    title: 'Shop Floor Execution',
    icon: 'work',
    route: '/shop-floor',
    description: 'Touch-optimized workstation queue with live engineering instructions, offline status, and integer-atom stage output.',
    guarantee: 'Strict mass conservation: output = passed + rework + scrap.',
  },
  {
    step: '06',
    title: 'Quality & Guarded Checklists',
    icon: 'checklist',
    route: '/quality/inspections',
    description: 'Inspect production lots against mandatory sign-off checklists, non-conformance tracking, and reinspection workflows.',
    guarantee: 'Gated disposition routing; unpassed stock cannot be delivered.',
  },
  {
    step: '07',
    title: 'Delivery & Lot Allocation',
    icon: 'truck',
    route: '/delivery/shipments',
    description: 'Allocate finished goods strictly from verified QC-passed inventory, generate manifests, and dispatch carrier shipments.',
    guarantee: 'Per-line quantity caps; double-entry inventory ledger deduction.',
  },
  {
    step: '08',
    title: 'Digital Product Passport',
    icon: 'shield',
    route: '/passports/[serial]',
    description: 'Serialized digital product passports detailing verified component lots, inspection certificates, and tamper-evident history.',
    guarantee: 'Immutable unit genealogy; direct customer portal verification.',
  },
];

export function LandingFlow() {
  return (
    <section id="flow" className="l-section l-section-alt" aria-labelledby="flow-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">End-to-End Operational Continuum</span>
          <h2 id="flow-heading" className="l-section-title">
            Eight interconnected stages. Zero siloed handoffs.
          </h2>
          <p className="l-section-desc">
            ManuOS replaces disjointed spreadsheets, paper travellers, and isolated systems with one authoritative,
            server-enforced manufacturing lifecycle.
          </p>
        </div>

        <div className="l-stage-grid">
          {FLOW_STAGES.map((stage) => (
            <article key={stage.step} className="l-stage-card">
              <span className="l-stage-card-num">STAGE {stage.step}</span>
              <div className="l-stage-icon-box" aria-hidden="true">
                <Icon name={stage.icon} className="w-5 h-5" />
              </div>
              <h3 className="l-stage-title">{stage.title}</h3>
              <p className="l-stage-desc">{stage.description}</p>
              
              <div className="l-stage-route-link">
                <span className="text-primary font-semibold">Invariant:</span>
                <span className="text-right truncate ml-1">{stage.guarantee}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
