'use client';

import React from 'react';
import { Icon, type IconName } from '@/components/icons';
import Link from 'next/link';

interface Persona {
  role: string;
  subtitle: string;
  route: string;
  icon: IconName;
  quote: string;
  features: string[];
}

const PERSONAS: Persona[] = [
  {
    role: 'Factory Owner & Executive',
    subtitle: 'Command Center & Margin Oversight',
    route: '/dashboard',
    icon: 'chart',
    quote: 'I need immediate clarity on order delivery risk and capacity bottlenecks without waiting for end-of-day reports.',
    features: [
      'Enterprise delivery risk and promise date tracking',
      'Critical path bottleneck detection across work centers',
      'One-click human review and sign-off on AI recovery plans',
      'Real-time double-entry inventory reconciliation audit',
    ],
  },
  {
    role: 'Production Planner & Supervisor',
    subtitle: 'Finite Scheduling & Task DAGs',
    route: '/planning',
    icon: 'calendar',
    quote: 'I coordinate machine capacity, operator certifications, and material readiness before dispatching work.',
    features: [
      'Interactive multi-order DAG dependency timeline',
      'Technician qualification and active certification gate',
      'Versioned published schedules with change audit trail',
      'Automated material demand reservation against WIP',
    ],
  },
  {
    role: 'Technician & Station Operator',
    subtitle: 'Workstation Queue & Mass Capture',
    route: '/shop-floor',
    icon: 'work',
    quote: 'I want unambiguous work orders, pinned engineering specs, and quick output logging right at my station.',
    features: [
      'Touch-friendly queue organized by assigned work center',
      'Pinned drawing previews and step-by-step instructions',
      'Mass-conserving output, rework, and scrap reporting',
      'Clear online/offline indicators with mutation protection',
    ],
  },
  {
    role: 'Customer & Procurement Partner',
    subtitle: 'Transparent Portal & Product Passport',
    route: '/portal/orders',
    icon: 'shield',
    quote: 'I want live order milestones and verified quality certificates without having to chase account managers.',
    features: [
      'Strict customer-isolated self-service tracking portal',
      'Engineering change order (ECO) review and sign-off',
      'Tamper-evident Digital Product Passport with serial history',
      'Downloadable QC inspection results and certificates',
    ],
  },
];

export function LandingPersonas() {
  return (
    <section id="personas" className="l-section" aria-labelledby="personas-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">Role-Tailored Experiences</span>
          <h2 id="personas-heading" className="l-section-title">
            Built for every seat in the manufacturing enterprise
          </h2>
          <p className="l-section-desc">
            ManuOS routes users automatically to their tailored operational cockpit based on verified permissions
            and RBAC roles.
          </p>
        </div>

        <div className="l-persona-grid">
          {PERSONAS.map((p) => (
            <div key={p.role} className="l-persona-card">
              <div className="l-persona-header">
                <div className="l-persona-avatar" aria-hidden="true">
                  <Icon name={p.icon} className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="l-persona-role">{p.role}</h3>
                  <span className="l-persona-sub">{p.subtitle}</span>
                </div>
              </div>

              <blockquote className="l-persona-quote">
                &ldquo;{p.quote}&rdquo;
              </blockquote>

              <ul className="l-persona-features">
                {p.features.map((feature, idx) => (
                  <li key={idx}>
                    <Icon name="check" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4 border-t border-line mt-auto">
                <Link href={p.route} className="l-persona-footer-link">
                  <span>Explore {p.subtitle.split('&')[0].trim()}</span>
                  <Icon name="arrow" className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
