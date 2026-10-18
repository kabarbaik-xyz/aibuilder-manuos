'use client';

import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { selectRealProgress } from '../../store/selectors';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ComputedValue } from '../../components/ui/computed-value';

export function WorkstationView() {
  const store = useGraphStore();
  const { recordOutput, requestInspection } = store;
  const openModal = useUiStore((s) => s.openModal);

  const progress = selectRealProgress(store, '1042');
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(2976); // ~49m 36s

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const formatTimer = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [hrs, mins, secs]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My workstation</h1>
          <p>One task at a time. Every unit accounted for.</p>
        </div>
        <Badge variant="blue">CNC-02 · Demo</Badge>
      </div>

      <section className="panel operator-header">
        <span className="avatar">HW</span>
        <div className="operator-info">
          <h3>
            Hendra Wijaya <Badge variant="default">CNC specialist · L4</Badge>
          </h3>
          <p>
            Morning shift · 07:00–15:30{' '}
            <span className="success-text">
              · Certified for this operation
            </span>
          </p>
        </div>
        <div className="operator-shift">
          <div>
            SHIFT TIME
            <strong>6.5 / 8 hours</strong>
          </div>
          <div>
            CURRENT MACHINE
            <strong>CNC-02</strong>
          </div>
        </div>
      </section>

      <div className="work-layout">
        <div className="stack">
          <section className="panel work-task">
            <div className="between">
              <div className="task-meta">
                <Badge variant="blue">T3</Badge>
                <span>Order #CO-2026-1042</span>
              </div>
              <Badge
                variant={isPaused ? 'warning' : 'blue'}
                icon={isPaused ? 'pause' : 'play'}
              >
                {isPaused ? 'Paused' : 'In progress'}
              </Badge>
            </div>

            <h2>Finish machining on chassis bracket</h2>
            <p className="muted small">
              CB-4402 · Aluminum 6061-T6 · Drawing rev 2
            </p>

            <div className="work-status">
              <div>
                <span className="small muted">Time on task</span>
                <div className="timer" id="task-timer">
                  {formatTimer(elapsedSeconds)}
                </div>
              </div>
              <Button
                icon={isPaused ? 'play' : 'pause'}
                onClick={() => {
                  setIsPaused(!isPaused);
                  useUiStore
                    .getState()
                    .showToast(
                      isPaused ? 'Task resumed.' : 'Task paused. Timer stopped.'
                    );
                }}
              >
                {isPaused ? 'Resume task' : 'Pause task'}
              </Button>
            </div>

            <div className="quantity-row">
              <div className="quantity-cell">
                <span>Completed</span>
                <strong>
                  <ComputedValue
                    value={<>{progress.completedQty}<small> / 120</small></>}
                    calculationExplanation="Recorded physical output from CNC machining"
                  />
                </strong>
                <p>Physical output</p>
              </div>

              <div className="quantity-cell">
                <span>QC-passed</span>
                <strong>
                  <ComputedValue
                    value={progress.qcPassedQty}
                    calculationExplanation="Units passed by Siti Nurhaliza in QC cell (Real Progress numerator)"
                  />
                </strong>
                <p>Verified output</p>
              </div>

              <div className="quantity-cell">
                <span>Awaiting QC</span>
                <strong>
                  <ComputedValue
                    value={progress.awaitingQC}
                    calculationExplanation="Completed units pending final dimensional and electrical inspection"
                  />
                </strong>
                <p>Ready for inspection</p>
              </div>
            </div>

            <div className="work-actions">
              <Button
                variant="primary"
                icon="plus"
                onClick={() => openModal('record-output')}
              >
                Record output
              </Button>
              <Button
                icon="flag"
                onClick={() => {
                  if (progress.awaitingQC > 0) {
                    requestInspection('T3');
                  } else {
                    useUiStore.getState().showToast('No completed units awaiting inspection.');
                  }
                }}
              >
                Request inspection
              </Button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Drawing & instructions</h2>
              </div>
              <Button
                variant="text"
                iconRight="file"
                onClick={() => openModal('drawing')}
              >
                View revision
              </Button>
            </div>
            <div className="panel-body">
              <div className="blueprint">
                <svg
                  viewBox="0 0 530 260"
                  role="img"
                  aria-label="Chassis bracket drawing, 320 by 160 millimeters with four mounting holes"
                >
                  <defs>
                    <pattern
                      id="drawing-grid"
                      width="20"
                      height="20"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M20 0H0V20"
                        fill="none"
                        stroke="#26405a"
                        strokeWidth="0.5"
                      />
                    </pattern>
                  </defs>
                  <rect
                    width="530"
                    height="260"
                    fill="url(#drawing-grid)"
                  />
                  <g fill="none" stroke="#8ab7ec" strokeWidth="1.4">
                    <rect
                      x="110"
                      y="66"
                      width="310"
                      height="148"
                      rx="28"
                    />
                    <circle cx="189" cy="140" r="35" />
                    <circle cx="343" cy="140" r="35" />
                    <circle
                      cx="265"
                      cy="140"
                      r="10"
                      strokeDasharray="3 3"
                    />
                    <circle cx="140" cy="92" r="5" />
                    <circle cx="390" cy="92" r="5" />
                    <circle cx="140" cy="187" r="5" />
                    <circle cx="390" cy="187" r="5" />
                  </g>
                  <g fill="none" stroke="#728bab" strokeWidth="0.7">
                    <path d="M110 48h310M110 39v18M420 39v18M445 66v148M438 66h14M438 214h14" />
                    <path
                      d="M265 45v192M94 140h344"
                      strokeDasharray="4 5"
                    />
                  </g>
                  <g
                    fill="#bbcee6"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                    fontSize="11"
                  >
                    <text x="222" y="38">
                      320.00 ± 0.02 mm
                    </text>
                    <text x="452" y="145">
                      160.00
                    </text>
                  </g>
                  <circle
                    cx="343"
                    cy="140"
                    r="43"
                    fill="none"
                    stroke="#5bbc98"
                    strokeDasharray="4 3"
                  />
                </svg>
                <div className="blueprint-caption">
                  <span>DWG-CB44 · REV 2</span>
                  <span>Dimensions in mm</span>
                </div>
              </div>

              <ol className="instruction-list mt">
                <li>Confirm the datum and secure the bracket on CNC-02 fixture.</li>
                <li>Run finish pass. Hold tolerance within ±0.02 mm.</li>
                <li>Check dimensions and move completed units to QC buffer.</li>
              </ol>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Before you start</h2>
              </div>
              <Badge variant="success">Ready</Badge>
            </div>
            <div className="panel-body">
              <div className="spec-row">
                <span>Material</span>
                <strong>6061-T6 · In stock</strong>
              </div>
              <div className="spec-row">
                <span>Machine</span>
                <strong>CNC-02 · Available</strong>
              </div>
              <div className="spec-row">
                <span>Tool</span>
                <strong>12 mm carbide end mill</strong>
              </div>
              <div className="spec-row">
                <span>Certification</span>
                <strong className="success-text">Valid until Dec 2026</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Unit passport</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="qr-wrap">
                <svg
                  className="qr"
                  viewBox="0 0 90 90"
                  role="img"
                  aria-label="Passport scan symbol"
                >
                  <rect width="90" height="90" fill="white" />
                  <g fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5 5h25v25H5Zm5 5v15h15V10Zm50-5h25v25H60Zm5 5v15h15V10ZM5 60h25v25H5Zm5 5v15h15V65Z"
                    />
                    <path d="M14 14h7v7h-7m50 0h7v7h-7M14 69h7v7h-7M38 5h7v7h-7m0 6h7v13h-7m7 14h7v7h-7M5 38h13v7H5m20-7h7v14h-7m13-7h7v13h-7m14-20h7v7h-7m14 7h7v7h-7m7-7h13v7H72m-7 6h7v13h-7m-20 0h14v7H45m-7 0h7v13h-7m14 7h7v7h-7m13-7h7v14h-7m7-7h13v7H72m7-20h7v7h-7M38 78h7v7h-7m7-7h7v7h-7" />
                  </g>
                </svg>
                <div>
                  <strong>SN-1042-078</strong>
                  <p>Material, operation and QC history.</p>
                </div>
              </div>
              <Button
                variant="default"
                fullWidth
                icon="shield"
                onClick={() => openModal('passport', { serial: 'SN-1042-078' })}
              >
                Open passport
              </Button>
              <p className="small muted mt text-center">
                Traceability verification · Serial 078
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Up next</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="inline-cluster">
                <span className="activity-symbol">
                  <Icon name="shield" />
                </span>
                <div>
                  <strong className="small">Dimensional inspection</strong>
                  <p className="small muted">T4 · After machining</p>
                </div>
              </div>
              <div className="recommendation mt">
                <Icon name="user" />
                <div>
                  <strong>Need a hand?</strong>
                  <p>Marco Rossi · Cell lead</p>
                </div>
              </div>
              <Button
                variant="default"
                fullWidth
                className="mt"
                onClick={() => openModal('support')}
              >
                Contact cell lead
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
