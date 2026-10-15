'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { selectRealProgress } from '../../store/selectors';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ComputedValue } from '../../components/ui/computed-value';

export function CustomerPortalView() {
  const store = useGraphStore();
  const {
    activeRecovery,
    disruption,
    acknowledgePromise,
    openModal,
  } = store;

  const heroOrder = store.orders.find((o) => o.id === '1042')!;
  const progress = selectRealProgress(store, '1042');
  const isApproved = activeRecovery?.status === 'APPLIED';
  const isAcknowledged = heroOrder.customerAcknowledged;
  const isDelayed = disruption.isDelayed;

  const downloadSample = (filename: string) => {
    const text = `MANUOS · ORDER DOCUMENT SAMPLE\nOrder #CO-2026-1042 · Meridian Energy\nDocument: ${filename}\nDate: 2026-11-24\nQC-passed output: 78 / 120 units\nStatus: Verified\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.showToast('Document sample downloaded.');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Your production, clearly.</h1>
          <p>Track verified progress and your next delivery.</p>
        </div>
        <Button
          icon="download"
          onClick={() => openModal('documents')}
        >
          Order documents
        </Button>
      </div>

      {isApproved && !isAcknowledged && (
        <section className="attention-band">
          <span className="attention-icon">
            <Icon name="truck" />
          </span>
          <div className="attention-copy">
            <h3>Your delivery plan has changed</h3>
            <p>40 units on Nov 25. Remaining 80 on Nov 28.</p>
          </div>
          <Button
            variant="default"
            icon="check"
            onClick={() => acknowledgePromise('1042')}
          >
            Acknowledge plan
          </Button>
        </section>
      )}

      <section className="panel order-summary">
        <div className="portal-summary-top">
          <div>
            <div className="inline-cluster">
              <strong className="small text-primary">#CO-2026-1042</strong>
              <Badge
                variant={
                  isApproved ? 'blue' : isDelayed ? 'warning' : 'success'
                }
              >
                {isApproved
                  ? 'Split delivery'
                  : isDelayed
                  ? 'Plan under review'
                  : 'On track'}
              </Badge>
            </div>
            <h2>Custom control panel assemblies</h2>
            <p className="order-subtitle">120 units ordered · Meridian Energy</p>
          </div>

          <div className="portal-progress">
            <span>QC-passed progress</span>
            <strong>
              <ComputedValue
                value={<>{progress.progressPct}%</>}
                calculationExplanation="Verified customer progress = 78 QC-passed / 120 ordered"
              />
            </strong>
            <span>{progress.qcPassedQty} of 120 units verified</span>
          </div>
        </div>

        {/* Real Progress Multi-Segment Bar */}
        <div
          className="progress-full"
          aria-label={`${progress.qcPassedQty} QC-passed, ${progress.awaitingQC} awaiting QC, ${
            120 - progress.completedQty
          } in production`}
        >
          <span
            className="passed"
            style={{ width: `${(progress.qcPassedQty / 120) * 100}%` }}
          />
          <span
            className="qc-pending"
            style={{ width: `${(progress.awaitingQC / 120) * 100}%` }}
          />
          <span className="pending" style={{ flex: 1 }} />
        </div>

        <div className="progress-legend">
          <span>
            <span className="dot blue" /> {progress.qcPassedQty} QC-passed
          </span>
          <span>
            <span className="dot" style={{ background: '#8bacfa' }} />{' '}
            {progress.awaitingQC} awaiting QC
          </span>
          <span>
            <span className="dot" style={{ background: '#bdc8db' }} />{' '}
            {120 - progress.completedQty} in production
          </span>
        </div>

        <div className="deliveries">
          <div className="delivery">
            <div className="between">
              <span className="small muted">
                {isApproved ? 'Delivery 1 · 40 units' : 'Original commitment'}
              </span>
              <Badge variant="blue">
                {isApproved ? 'Confirmed' : 'Nov 25'}
              </Badge>
            </div>
            <strong>Wednesday, Nov 25</strong>
            <p>
              {isApproved
                ? 'Ready units reserved for first shipment.'
                : '120 units · delivery promise'}
            </p>
          </div>

          <div className="delivery">
            <div className="between">
              <span className="small muted">
                {isApproved ? 'Delivery 2 · 80 units' : 'Current projection'}
              </span>
              <Badge variant={isDelayed ? 'warning' : 'success'}>
                {isDelayed ? 'Projected' : 'On track'}
              </Badge>
            </div>
            <strong>
              {isApproved || isDelayed
                ? 'Saturday, Nov 28'
                : 'Wednesday, Nov 25'}
            </strong>
            <p>
              {isApproved
                ? 'Remaining units after final QC.'
                : isDelayed
                ? 'Recovery options are being reviewed.'
                : 'Production is on schedule.'}
            </p>
          </div>
        </div>
      </section>

      <div className="portal-layout">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>The story of your unit</h2>
              <p>SN-1042-078 · Materials to final sign-off</p>
            </div>
            <Button
              variant="text"
              iconRight="arrow"
              onClick={() => openModal('passport', { serial: 'SN-1042-078' })}
            >
              Open full passport
            </Button>
          </div>
          <div className="panel-body">
            <ol className="timeline">
              <li>
                <div className="between">
                  <h3>Material verified</h3>
                  <time>Nov 18 · 08:34</time>
                </div>
                <p>6061-T6 · Lot AL-89240 inspection verified</p>
              </li>
              <li>
                <div className="between">
                  <h3>CNC machining complete</h3>
                  <time>Nov 19 · 14:12</time>
                </div>
                <p>Drawing DWG-CB44 rev 2 · machining complete</p>
              </li>
              <li className="warning">
                <div className="between">
                  <h3>Inspection & rework</h3>
                  <time>Nov 20 · 10:45</time>
                </div>
                <p>
                  Bend angle outside tolerance. Corrected on press brake and
                  reinspected.
                </p>
                <Badge variant="warning">Rework recorded</Badge>
              </li>
              <li>
                <div className="between">
                  <h3>Final QC passed</h3>
                  <time>Nov 21 · 16:30</time>
                </div>
                <p>Dimensions, electrical checks and torque verified.</p>
              </li>
              <li>
                <div className="between">
                  <h3>Released for delivery</h3>
                  <time>Nov 22 · 11:05</time>
                </div>
                <p>Signed off by quality lead. Unit serial 078.</p>
              </li>
            </ol>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Order documents</h2>
              </div>
              <Badge variant="default">3 files</Badge>
            </div>
            <div className="panel-body">
              {[
                ['Inspection test plan', 'Rev C · Quality checklist', 'ITP-1042.txt'],
                ['Material certificate', 'Lot AL-89240 · 6061-T6', 'MTR-1042.txt'],
                ['Final inspection report', 'Serial 078 · Passed', 'QC-1042.txt'],
              ].map(([name, sub, file]) => (
                <div key={file} className="document-row">
                  <Icon name="file" />
                  <div className="document-copy">
                    <strong>{name}</strong>
                    <p>{sub}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => downloadSample(file)}
                    aria-label={`Download ${name}`}
                  >
                    <Icon name="download" />
                  </button>
                </div>
              ))}
              <Button
                variant="default"
                fullWidth
                className="mt"
                icon="download"
                onClick={() => downloadSample('All-Documents-1042.zip')}
              >
                Download all
              </Button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Your production contact</h2>
              </div>
            </div>
            <div className="panel-body">
              <div className="inline-cluster">
                <span className="avatar">MR</span>
                <div>
                  <strong className="small">Marco Rossi</strong>
                  <p className="small muted">Production lead</p>
                </div>
              </div>
              <Button
                variant="default"
                fullWidth
                className="mt"
                onClick={() => openModal('support')}
              >
                Send a message
              </Button>
              <p className="small muted mt">
                Updates are shared when milestones change.
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="portal-note">
        <Icon name="shield" />
        Progress reflects QC-passed units. Delivery dates reflect the current
        approved plan.
      </div>
    </div>
  );
}
