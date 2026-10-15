'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';

export function DealModal({ capacity = false }: { capacity?: boolean }) {
  const store = useGraphStore();
  const { networkDeals, acceptNetworkDeal, receiveNetworkMaterial, closeModal } = store;

  const activeSupplyDeal = networkDeals.find((d) => d.targetRef === 'TB-24');
  const isAccepted = activeSupplyDeal?.status === 'ACCEPTED';

  return (
    <div>
      <div className="need-highlight">
        <strong>
          {capacity ? 'CNC capability verified' : 'TB-24 · Matching specification'}
        </strong>
        <p>
          {capacity
            ? 'Assembly capability and material availability need verification.'
            : '42 units · ETA Nov 26 · 1 day earlier than current supplier'}
        </p>
      </div>

      <div className="match-facts">
        <div>
          <strong>{capacity ? '210 h' : '42 units'}</strong>
          <span>{capacity ? 'Free CNC capacity' : 'Available stock'}</span>
        </div>
        <div>
          <strong>{capacity ? '1.1×' : 'Nov 26'}</strong>
          <span>{capacity ? 'Rate index' : 'Projected receipt'}</span>
        </div>
      </div>

      <div className="dialog-section">
        <h3>Consent & approval</h3>
        <ul className="change-list">
          <li>
            <Icon name="check" />
            <span>Partner opted in to {capacity ? 'capacity' : 'supply'} sharing</span>
          </li>
          <li>
            <Icon name="check" />
            <span>Your factory reviews the proposal</span>
          </li>
          <li>
            <Icon name="clock" />
            <span>Partner acceptance is simulated explicitly</span>
          </li>
        </ul>
      </div>

      {capacity ? (
        <div className="recommendation">
          <Icon name="info" />
          <div>
            <strong>CNC capacity is not an assembly match.</strong>
            <p>
              Confirm the required electrical assembly and QC process before outsourcing.
            </p>
          </div>
        </div>
      ) : (
        <p className="small muted">
          Acceptance updates the expected receipt. Blocked tasks stay blocked until materials are physically received.
        </p>
      )}

      <div className="dialog-actions mt">
        {capacity ? (
          <Button variant="default" fullWidth onClick={closeModal}>
            Back to recovery
          </Button>
        ) : (
          <Button
            variant="primary"
            fullWidth
            icon="check"
            onClick={() => {
              if (isAccepted) {
                receiveNetworkMaterial('deal-tb-24');
                closeModal();
              } else {
                acceptNetworkDeal('deal-tb-24');
                closeModal();
              }
            }}
          >
            {isAccepted
              ? 'Record material receipt'
              : 'Approve & simulate partner acceptance'}
          </Button>
        )}
      </div>
    </div>
  );
}
