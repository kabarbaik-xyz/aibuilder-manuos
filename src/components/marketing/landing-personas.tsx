'use client';

import React from 'react';
import { Icon, type IconName } from '@/components/icons';
import Link from 'next/link';

interface Persona {
  role: string;
  subtitle: string;
  route: string;
  icon: IconName;
  summary: string;
  highlights: string[];
}

const PERSONAS: Persona[] = [
  {
    role: 'Factory Executive',
    subtitle: 'Command & Margin Oversight',
    route: '/dashboard',
    icon: 'chart',
    summary: 'Real-time visibility into delivery risk, work-center bottlenecks, and inventory health.',
    highlights: [
      'Live On-Time Delivery SLA tracker',
      'Critical-path bottleneck alerts',
      '1-click AI recovery approval',
    ],
  },
  {
    role: 'Production Planner',
    subtitle: 'Finite Scheduling & DAGs',
    route: '/planning',
    icon: 'calendar',
    summary: 'Coordinate machine calendars, technician certifications, and raw material readiness.',
    highlights: [
      'Visual multi-order DAG timeline',
      'Operator certification gates',
      'Automated WIP lot reservation',
    ],
  },
  {
    role: 'Station Technician',
    subtitle: 'Touch Workstation Queue',
    route: '/shop-floor',
    icon: 'work',
    summary: 'Clear prioritized job queues, pinned drawings, and fast output logging at the machine.',
    highlights: [
      'Pinned Rev-locked work specs',
      'Pass, rework & scrap capture',
      'Overproduction guardrails',
    ],
  },
  {
    role: 'Customer & Buyer',
    subtitle: 'Live Portal & Passports',
    route: '/portal/orders',
    icon: 'shield',
    summary: 'Self-service order milestone tracking, ECO sign-offs, and serialized quality certificates.',
    highlights: [
      'Live production stage tracking',
      'Online ECO review & approval',
      'Digital Product Passports',
    ],
  },
];

export function LandingPersonas() {
  return (
    <section id="personas" className="l-section" aria-labelledby="personas-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">Role-Tailored Cockpits</span>
          <h2 id="personas-heading" className="l-section-title">
            Purpose-built workspaces for every role.
          </h2>
          <p className="l-section-desc">
            Every user lands directly in a focused operational cockpit matched to their responsibilities.
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

              <p className="l-persona-summary">{p.summary}</p>

              <ul className="l-persona-features">
                {p.highlights.map((feature, idx) => (
                  <li key={idx}>
                    <Icon name="check" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-3.5 border-t border-line mt-auto">
                <Link href={p.route} className="l-persona-footer-link">
                  <span>Open {p.role} View</span>
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
