'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { AIContent } from '../../components/ui/ai-content';

export function BrainDrawer() {
  const store = useGraphStore();
  const { disruption, activeRecovery, setScreen, closeModal } = store;

  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isDelayed = disruption.isDelayed;
  const isApproved = activeRecovery?.status === 'APPLIED';

  const askQuestion = async (qKey: 'risk' | 'runnable' | 'plan') => {
    setActiveQuestion(qKey);
    setLoading(true);

    const questions: Record<string, string> = {
      risk: 'Which orders need attention and why?',
      runnable: 'What work can keep running despite the disruption?',
      plan: 'What changed in the approved recovery plan?',
    };

    try {
      const res = await fetch('/api/ai/brain-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questions[qKey],
          snapshot: {
            delayed: isDelayed,
            approved: isApproved,
            delayedMaterial: 'TB-24',
            blockedTasks: disruption.blockedTaskIds,
            affectedOrders: disruption.affectedOrderIds,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiResult?.answer) {
          setAnswer(data.aiResult.answer);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback below
    }

    // Deterministic state summary fallback
    const answers: Record<string, string> = {
      risk: isDelayed
        ? `Order #1042 is projected for Nov 28 (+3 days) due to delayed terminal blocks. Order #1045 is on watch.${
            isApproved ? ' A split delivery has been approved for #1042.' : ''
          }`
        : 'All 6 orders are on schedule. No active material disruptions or machine outages.',
      runnable:
        'Machining on CNC-02, press bending, front panels, and enclosure fitting can continue. Only wiring (T12) and final electrical QC (T13, T14) wait for terminal blocks.',
      plan: isApproved
        ? '40 ready units are reserved for Nov 25 delivery. The remaining 80 units are scheduled for Nov 28. Verified QC quantities remain unchanged.'
        : 'No recovery plan has been applied yet. Review the recommended split batch in the Recovery Studio.',
    };

    setAnswer(answers[qKey]);
    setLoading(false);
  };

  return (
    <div>
      <div className="assistant-message">
        <Badge variant="ai" icon="spark">
          Live Operational Brain
        </Badge>
        <p className="mt-2 text-xs text-muted">
          Ask questions about production status, dependencies, and deliveries.
        </p>
      </div>

      <div className="my-3">
        {[
          ['risk', 'Which orders need attention?'],
          ['runnable', 'What can keep running?'],
          ['plan', 'What changed in the recovery plan?'],
        ].map(([key, text]) => (
          <button
            key={key}
            type="button"
            className="question-chip"
            onClick={() => askQuestion(key as any)}
          >
            {text}
          </button>
        ))}
      </div>

      {loading && (
        <div className="p-4 text-center text-xs text-muted">
          Consulting manufacturing graph state…
        </div>
      )}

      {answer && !loading && (
        <div className="mt-4">
          <div className="user-message">
            {activeQuestion === 'risk'
              ? 'Which orders need attention?'
              : activeQuestion === 'runnable'
              ? 'What can keep running?'
              : 'What changed in the recovery plan?'}
          </div>

          <AIContent
            badgeLabel="Brain Answer"
            sourceContextTitle="Live Manufacturing Graph Snapshot"
          >
            <p>{answer}</p>
            <div className="mt-3">
              <Button
                variant="text"
                iconRight="arrow"
                onClick={() => {
                  closeModal();
                  setScreen('orchestrator');
                }}
              >
                Open production orchestrator
              </Button>
            </div>
          </AIContent>
        </div>
      )}

      <p className="approval-note">
        Read-only operational assistant. Answers are grounded in the active shop-floor state without write capabilities.
      </p>
    </div>
  );
}
