'use client';

import React from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';

export function LandingAI() {
  return (
    <section id="ai-governance" className="l-section" aria-labelledby="ai-heading">
      <div className="l-section-inner">
        <div className="l-ai-banner">
          <div>
            <div className="l-ai-badge">
              <Icon name="spark" className="w-4 h-4 text-primary" />
              <span>Grounded Operational Intelligence</span>
            </div>

            <h2 id="ai-heading" className="l-ai-title">
              Deterministic engines calculate. CoreAI proposes. Humans decide.
            </h2>

            <p className="l-ai-desc">
              Manufacturing cannot afford generative hallucinations. In ManuOS, deterministic CPM engines
              compute true mathematical dependencies, while CoreAI drafts actionable recovery proposals.
              No schedule change or inventory movement is applied without explicit human sign-off.
            </p>

            <ul className="l-ai-guardrails">
              <li>
                <Icon name="check" />
                <span>
                  <strong>Deterministic Feasibility:</strong> Critical Path Method (CPM) and resource capacity
                  are evaluated mathematically, never guessed.
                </span>
              </li>
              <li>
                <Icon name="check" />
                <span>
                  <strong>Explainable Trade-Offs:</strong> CoreAI presents plain-language trade-offs, showing
                  cost, labor, and lead time impacts before any decision is taken.
                </span>
              </li>
              <li>
                <Icon name="check" />
                <span>
                  <strong>Strict Human-in-the-Loop Gate:</strong> All operational recovery proposals require
                  verified supervisor approval before committing database changes.
                </span>
              </li>
            </ul>
          </div>

          {/* Interactive Proposal Inspection Card */}
          <div className="l-ai-interactive-card" aria-label="CoreAI Recovery Proposal Demonstration">
            <div className="l-ai-prompt-header">
              <span>
                <Icon name="spark" className="w-4 h-4 text-primary" />
                CoreAI Recovery Assistant
              </span>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Grounded Evaluation
              </span>
            </div>

            <div className="l-ai-prompt-sample">
              <div className="text-[11px] font-bold text-ink uppercase mb-1">Detected Schedule Variance:</div>
              CNC Milling station OP-20 reported 45-minute setup delay on order MO-2026-8812. Downstream assembly promise date at risk.
            </div>

            <div className="l-ai-proposal-preview">
              <div className="font-bold text-xs uppercase mb-1 text-amber-900">
                Generated Recovery Recommendation:
              </div>
              <div>
                Re-route 20 units to parallel station CNC-02. Predicted recovery: delivery promise preserved (slack +1.2 hrs). Material and tooling requirements verified.
              </div>
            </div>

            <div className="l-ai-approval-banner">
              <div className="text-xs text-muted">
                Requires: <strong>Supervisor Signature</strong>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="soft" size="small" disabled>
                  Reject Plan
                </Button>
                <Button variant="primary" size="small" disabled>
                  Approve Recovery
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
