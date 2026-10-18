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
    reviewContext: string;
    gateStatus: string;
  };
  approverRole: string;
  workspaceHref: string;
}

const AI_SCENARIOS: AIScenario[] = [
  {
    id: 'machine', label: 'Alternative machine', badge: 'SCHEDULE REVIEW', icon: 'calendar',
    orderRef: 'Example · Milling operation', customer: 'Illustrative factory',
    triggerTitle: 'A booked machine is delaying a released job.',
    cpmSummary: 'Review compatible machines, current bookings, and the operation requirements.',
    recommendedAction: 'Compare an eligible alternative machine and submit the selected schedule for supervisor review.',
    metrics: { promiseImpact: 'Projected finish', reviewContext: 'Supervisor review', gateStatus: 'Recheck on approval' },
    approverRole: 'Assigned supervisor', workspaceHref: '/ai/recovery',
  },
  {
    id: 'overtime', label: 'Overtime proposal', badge: 'CAPACITY REVIEW', icon: 'clock',
    orderRef: 'Example · Capacity constraint', customer: 'Illustrative factory',
    triggerTitle: 'Available working hours may not cover the planned operation.',
    cpmSummary: 'Check the technician availability, existing bookings, and workspace overtime limits.',
    recommendedAction: 'Review a proposed overtime interval before the affected technician’s supervisor approves the schedule.',
    metrics: { promiseImpact: 'Schedule estimate', reviewContext: 'Direct supervisor', gateStatus: 'Availability checks' },
    approverRole: 'Technician’s direct supervisor', workspaceHref: '/ai/recovery',
  },
  {
    id: 'date', label: 'Delivery-date review', badge: 'PROMISE REVIEW', icon: 'delivery',
    orderRef: 'Example · Released job', customer: 'Illustrative factory',
    triggerTitle: 'A requested delivery date needs a capacity check.',
    cpmSummary: 'Review open tasks, reserved materials, resource availability, and current bookings.',
    recommendedAction: 'Evaluate the requested date for the selected released job. Resolve missing evidence before using the result as a commitment.',
    metrics: { promiseImpact: 'Feasibility review', reviewContext: 'Planner decision', gateStatus: 'Complete evidence needed' },
    approverRole: 'Planner review; no promise is committed', workspaceHref: '/ai/promise',
  },
];

const COREAI_USES: { title: string; description: string; icon: IconName }[] = [
  { title: 'Ask your operations', description: 'Find answers about orders, inventory, and resources with links to the records behind them.', icon: 'spark' },
  { title: 'See what needs attention', description: 'Review delivery risks and operational exceptions, then open the affected records.', icon: 'alert' },
  { title: 'Review recovery options', description: 'Compare supported machine and overtime proposals before requesting approval.', icon: 'calendar' },
  { title: 'Start with a useful draft', description: 'Turn RFQ text into reviewed order inputs, or draft workflows and forms with AI assistance.', icon: 'engineering' },
];

export function LandingAI() {
  const [activeId, setActiveId] = useState<string>(AI_SCENARIOS[0].id);
  const scenario = AI_SCENARIOS.find((s) => s.id === activeId) ?? AI_SCENARIOS[0];

  return (
    <section id="ai-governance" className="l-section coreai-section" aria-labelledby="ai-heading">
      <div className="l-section-inner">
        <div className="coreai-heading">
          <h2 id="ai-heading">A clearer view.<br /><span>A better next move.</span></h2>
          <p>Bring your operational questions to CoreAI. Find the context, see what needs attention, and move forward with a plan your team can review.</p>
        </div>

        <div className="coreai-layout">
          <div className="coreai-capabilities">
            {COREAI_USES.map((use) => (
              <article key={use.title} className="coreai-capability">
                <span className="coreai-capability-icon"><Icon name={use.icon} /></span>
                <div><h3>{use.title}</h3><p>{use.description}</p></div>
              </article>
            ))}
            <Link href="/demo" className="coreai-text-link">Explore the demo workspace <Icon name="arrow" /></Link>
          </div>

          <div className="coreai-preview">
            <div className="coreai-preview-header">
              <div><span className="coreai-assistant-mark"><Icon name="spark" /></span><strong>CoreAI</strong><span className="coreai-preview-caption">Decision workspace</span></div>
              <span className="coreai-example-label">Illustrative example</span>
            </div>
            <div className="coreai-example-options" role="group" aria-label="Recovery examples">
              {AI_SCENARIOS.map((item) => (
                <button key={item.id} type="button" aria-pressed={scenario.id === item.id} onClick={() => setActiveId(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="coreai-conversation" aria-live="polite" aria-atomic="true">
              <div className="coreai-question"><Icon name={scenario.icon} /><p>{scenario.triggerTitle}</p></div>
              <div className="coreai-response">
                <div className="coreai-response-label"><Icon name="spark" /><strong>Here’s what to review</strong></div>
                <p>{scenario.cpmSummary}</p>
                <div className="coreai-evidence"><Icon name="network" /><span>Requirements</span><span>Availability</span><span>Bookings</span></div>
                <div className="coreai-next-step"><span>Suggested next step</span><p>{scenario.recommendedAction}</p></div>
              </div>
              <div className="coreai-review-note"><Icon name="shield" /><span>{scenario.approverRole} · {scenario.metrics.gateStatus}</span></div>
            </div>
            <div className="coreai-preview-footer"><span>Preview only · no workspace changes</span><Link href={scenario.workspaceHref}>Open workspace <Icon name="arrow" /></Link></div>
          </div>
        </div>

        <div className="coreai-control-strip" aria-label="How CoreAI supports decisions">
          <div><Icon name="network" /><span>Connected records</span></div>
          <Icon name="arrow" className="coreai-strip-arrow" />
          <div><Icon name="spark" /><span>Reviewable suggestions</span></div>
          <Icon name="arrow" className="coreai-strip-arrow" />
          <div><Icon name="shield" /><span>Your team decides</span></div>
        </div>
        <details className="coreai-availability"><summary>About availability</summary><p>AI answers and drafting require an enabled AI provider. Tools follow your workspace permissions. Planning checks use recorded requirements, availability, and bookings.</p></details>
      </div>
    </section>
  );
}
