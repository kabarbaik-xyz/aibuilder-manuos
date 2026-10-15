'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { checkPromiseFeasibility, PromiseFeasibilityOutput } from '../../engines/capacity';
import { formatDateEn } from '../../engines/calendar';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { AIContent } from '../../components/ui/ai-content';

export function PromiseModal() {
  const { machines } = useGraphStore();
  const [family, setFamily] = useState('Control panel');
  const [qty, setQty] = useState(200);
  const [reqDate, setReqDate] = useState('2026-11-25');
  const [result, setResult] = useState<PromiseFeasibilityOutput | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Pure deterministic calculation
    const feasibility = checkPromiseFeasibility(
      {
        partFamily: family,
        quantity: qty,
        requestedDate: reqDate,
      },
      machines
    );

    setResult(feasibility);

    // 2. Fetch grounded AI explanation from server route
    try {
      const res = await fetch('/api/ai/promise-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { partFamily: family, quantity: qty, requestedDate: reqDate },
          feasibilityResult: feasibility,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiResult?.summary) {
          setAiExplanation(data.aiResult.summary);
        } else {
          setAiExplanation(null);
        }
      }
    } catch {
      setAiExplanation(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleCheck}>
        <div className="field">
          <label htmlFor="family-select">Part family</label>
          <select
            id="family-select"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="Control panel">Control panel</option>
            <option value="Chassis bracket">Chassis bracket</option>
            <option value="Mounting plate">Mounting plate</option>
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="promise-qty">Quantity</label>
            <input
              id="promise-qty"
              type="number"
              min={1}
              max={10000}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="promise-date">Requested delivery</label>
            <input
              id="promise-date"
              type="date"
              value={reqDate}
              onChange={(e) => setReqDate(e.target.value)}
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          icon="calendar"
          disabled={loading}
        >
          {loading ? 'Evaluating capacity…' : 'Check feasibility'}
        </Button>
      </form>

      {result && (
        <div className="result-box mt">
          <div className="between">
            <h3>Earliest feasible date</h3>
            <Badge variant="blue">Computed Estimate</Badge>
          </div>

          <span className="large block my-2 text-ink">
            {formatDateEn(result.feasibleDate)}
          </span>

          <p className="text-muted text-xs mb-3">
            {qty} units · {result.bottleneckReason}
          </p>

          <div className="spec-row">
            <span>Requested delivery</span>
            <strong>{formatDateEn(result.requestedDate)}</strong>
          </div>

          <div className="spec-row">
            <span>Delivery variance</span>
            <strong className={result.deltaDays > 0 ? 'warning-text' : 'success-text'}>
              {result.deltaDays > 0 ? `+${result.deltaDays} days later` : 'On schedule'}
            </strong>
          </div>

          <div className="spec-row">
            <span>Confidence margin</span>
            <strong className="text-primary">{result.confidence} (Slack Margin)</strong>
          </div>

          <div className="mt-4 pt-3 border-t border-line">
            <strong className="text-xs block mb-2">Computed Alternatives:</strong>
            {result.alternatives.map((alt, i) => (
              <div key={i} className="spec-row">
                <span>{alt.title}</span>
                <strong>
                  {formatDateEn(alt.feasibleDate)} ({alt.costDeltaPct > 0 ? `+${alt.costDeltaPct}%` : 'Standard'})
                </strong>
              </div>
            ))}
          </div>

          {aiExplanation ? (
            <AIContent
              badgeLabel="Promise Intelligence"
              sourceContextTitle="Capacity Load & Slack Margin"
              className="mt-4"
            >
              {aiExplanation}
            </AIContent>
          ) : (
            <div className="mt-4 p-3 bg-surface-muted rounded-lg border border-line text-xs text-muted">
              <Icon name="info" className="inline w-3.5 h-3.5 mr-1 text-primary" />
              Bottleneck is {result.bottleneckMachineClass}. Earliest open production slot without overbooking is {formatDateEn(result.feasibleDate)}.
            </div>
          )}
        </div>
      )}

      <p className="approval-note">
        Feasible date evaluation. This check validates capacity without mutating active production orders.
      </p>
    </div>
  );
}
