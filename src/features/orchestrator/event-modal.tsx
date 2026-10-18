'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { Button } from '../../components/ui/button';

export function EventModal() {
  const injectDisruption = useGraphStore((s) => s.injectDisruption);
  const closeModal = useUiStore((s) => s.closeModal);

  return (
    <div>
      <div className="need-highlight">
        <strong>Terminal blocks delayed by 2 days</strong>
        <p>Order #1042 expected delivery moves from Nov 25 to Nov 28.</p>
      </div>

      <div className="spec-row mt">
        <span>Affected orders</span>
        <strong>#CO-2026-1042 · #CO-2026-1045</strong>
      </div>

      <div className="spec-row">
        <span>Blocked tasks</span>
        <strong>Wiring · Electrical QC · Release</strong>
      </div>

      <div className="spec-row">
        <span>Still-runnable branches</span>
        <strong className="success-text">CNC machining · Enclosure fitting</strong>
      </div>

      <p className="approval-note">
        Simulates an external supplier logistics disruption. Triggers CPM ripple recalculation across the dependency graph.
      </p>

      <div className="dialog-actions mt">
        <Button
          variant="primary"
          fullWidth
          icon="bolt"
          onClick={() => {
            closeModal();
            injectDisruption('TB-24', 2);
          }}
        >
          Inject material delay
        </Button>
      </div>
    </div>
  );
}
