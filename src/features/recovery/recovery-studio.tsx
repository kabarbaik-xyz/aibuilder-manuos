'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

export function RecoveryStudio() {
  const store = useGraphStore();
  const {
    activeRecovery,
    disruption,
    approveRecoveryOption,
    closeModal,
    setScreen,
  } = store;

  const [selectedOption, setSelectedOption] = useState<'split' | 'shift' | 'outsource'>('split');

  const isApproved = activeRecovery?.status === 'APPLIED';

  if (isApproved) {
    return (
      <div>
        <div className="recovery-context">
          <Icon name="check" />
          <div>
            <strong>Split delivery · approved by Alex Rahman</strong>
            <p>40 units Nov 25 · 80 units Nov 28 · +0.8% cost impact</p>
          </div>
        </div>

        <div className="dialog-section">
          <h3>What changed</h3>
          <ul className="change-list">
            <li>
              <Icon name="check" />
              <span>40 verified ready units reserved for first delivery (Nov 25)</span>
            </li>
            <li>
              <Icon name="check" />
              <span>Remaining 80 units scheduled for Nov 28 after terminal block arrival</span>
            </li>
            <li>
              <Icon name="check" />
              <span>Customer promise updated in customer portal with acknowledgment required</span>
            </li>
            <li>
              <Icon name="check" />
              <span>Decision and cost allocation logged in activity audit log</span>
            </li>
          </ul>
        </div>

        <p className="approval-note">
          78 units have passed QC. Approval reallocated ready units to Tranche 1 without manufacturing or fabricating new QC passes.
        </p>

        <div className="dialog-actions mt">
          <Button
            variant="primary"
            fullWidth
            iconRight="arrow"
            onClick={() => {
              closeModal();
              setScreen('customer');
            }}
          >
            Open customer portal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="recovery-context">
        <Icon name="alert" />
        <div>
          <strong>Expected delivery has moved to Nov 28 (+3 days)</strong>
          <p>3 tasks blocked. Machining and internal assembly can continue.</p>
        </div>
      </div>

      <div className="dialog-section">
        <div className="between" style={{ marginBottom: 13 }}>
          <h3>Choose a recovery plan</h3>
          <Badge variant="blue">Engine Evaluation</Badge>
        </div>

        {/* Option 1: Split Batch */}
        <label
          className={`option ${selectedOption === 'split' ? 'selected' : ''}`}
          onClick={() => setSelectedOption('split')}
        >
          <div className="option-header">
            <span className="option-title">
              <input
                type="radio"
                name="recovery-opt"
                checked={selectedOption === 'split'}
                onChange={() => setSelectedOption('split')}
              />
              Split batch delivery
            </span>
            <Badge variant="success">Recommended</Badge>
          </div>
          <p>
            Ship 40 ready units on Nov 25. Deliver remaining 80 on Nov 28 after final inspection.
          </p>
          <div className="option-facts">
            <div>
              <strong>40 / 80</strong>
              <span>Delivery split</span>
            </div>
            <div>
              <strong>Nov 25 / 28</strong>
              <span>Delivery dates</span>
            </div>
            <div>
              <strong>+0.8%</strong>
              <span>Cost impact</span>
            </div>
          </div>
        </label>

        {/* Option 2: Additional Shift (Infeasible) */}
        <label className="option disabled">
          <div className="option-header">
            <span className="option-title">
              <input type="radio" disabled name="recovery-opt" />
              Additional shift (Overtime)
            </span>
            <Badge variant="warning">Not feasible</Badge>
          </div>
          <p>
            An overtime shift cannot resolve missing physical components.
          </p>
          <div className="option-facts">
            <div>
              <strong>+4.2%</strong>
              <span>Illustrative cost</span>
            </div>
            <div>
              <strong>No recovery</strong>
              <span>Until TB-24 arrives</span>
            </div>
          </div>
          <div className="option-reason">
            Constraint violation: TB-24 terminal blocks arrive Nov 27. Overtime labor cannot assemble without parts.
          </div>
        </label>

        {/* Option 3: Outsource Assembly */}
        <div className="option">
          <div className="option-header">
            <span className="option-title">
              <Icon name="network" /> Outsource assembly
            </span>
            <Badge variant="default">Partner review</Badge>
          </div>
          <p>Validate partner capability and obtain bilateral acceptance.</p>
          <div className="between" style={{ margin: '13px 0 0 25px' }}>
            <span className="small muted">Estimated cost +7.5%</span>
            <Button
              variant="text"
              iconRight="arrow"
              onClick={() => {
                closeModal();
                setScreen('network');
              }}
            >
              View partner match
            </Button>
          </div>
        </div>
      </div>

      <div className="dialog-section">
        <h3>On approval</h3>
        <ul className="change-list">
          <li>
            <Icon name="check" />
            <span>Reserve 40 ready units for Nov 25 dispatch</span>
          </li>
          <li>
            <Icon name="check" />
            <span>Plan the remaining 80 for Nov 28 release</span>
          </li>
          <li>
            <Icon name="check" />
            <span>Update customer commitment and log decision</span>
          </li>
        </ul>
      </div>

      <p className="approval-note">
        78 units have passed QC. Approving this plan changes shipment allocation, not production quantities.
      </p>

      <div className="dialog-actions">
        <p className="text-left">
          Alex Rahman · Owner
          <br />
          <span className="font-bold text-ink">Approval required</span>
        </p>
        <Button
          variant="primary"
          icon="check"
          onClick={() => {
            approveRecoveryOption('opt-split-batch', 'Alex Rahman');
            closeModal();
          }}
        >
          Approve split batch
        </Button>
      </div>
    </div>
  );
}
