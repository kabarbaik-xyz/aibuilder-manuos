'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { selectRealProgress, selectFactoryMetrics } from '../../store/selectors';
import { formatDateEn } from '../../engines/calendar';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ComputedValue } from '../../components/ui/computed-value';

export function CommandCenterView() {
  const store = useGraphStore();
  const { orders, disruption, activeRecovery, setScreen } = store;
  const openModal = useUiStore((s) => s.openModal);

  const [filter, setFilter] = useState<'all' | 'watch'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const metrics = selectFactoryMetrics(store);
  const heroProgress = selectRealProgress(store, '1042');
  const isApproved = activeRecovery?.status === 'APPLIED';
  const isDelayed = disruption.isDelayed;

  const filteredOrders = orders.filter((o) => {
    if (filter === 'watch' && o.status !== 'AT_RISK' && o.status !== 'WATCH') {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        o.number.toLowerCase().includes(q) ||
        o.partName.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Command center</h1>
          <p>Your factory at a glance. Tuesday, 24 November.</p>
        </div>
        <div className="actions">
          <Button icon="calendar" onClick={() => openModal('promise')}>
            Check feasibility
          </Button>
          <Button variant="primary" icon="plus" onClick={() => openModal('intake')}>
            New order
          </Button>
        </div>
      </div>

      <section className="metric-strip" aria-label="Factory metrics">
        <div className="metric">
          <div className="metric-label">
            <Icon name="order" /> Active orders
          </div>
          <div className="metric-value">
            <ComputedValue
              value={<>{metrics.activeOrdersCount} <span className="unit">orders</span></>}
              calculationExplanation="Count of non-delivered active production orders"
            />
          </div>
          <div className="metric-caption">3 due this week</div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Icon name="shield" /> QC-passed output
          </div>
          <div className="metric-value">
            <ComputedValue
              value={<>{heroProgress.progressPct}<span className="unit">%</span></>}
              calculationExplanation="78 QC-passed / 120 ordered = 65.0% verified output"
            />
          </div>
          <div className="metric-caption">
            {heroProgress.qcPassedQty} of 120 control panels
          </div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Icon name="alert" /> Orders to watch
          </div>
          <div
            className={`metric-value ${
              isDelayed && !isApproved ? 'warning-text' : ''
            }`}
          >
            <ComputedValue
              value={isDelayed ? (isApproved ? 1 : 2) : 0}
              calculationExplanation="Downstream ripple impact of material shortage on order delivery promises"
            />
          </div>
          <div className="metric-caption">
            {isDelayed ? 'Terminal block delay' : 'No active blockers'}
          </div>
        </div>

        <div className="metric">
          <div className="metric-label">
            <Icon name="bolt" /> Pending decisions
          </div>
          <div className="metric-value">
            <ComputedValue
              value={isDelayed && !isApproved ? 1 : 0}
              calculationExplanation="Count of actionable recovery recommendations awaiting owner approval"
            />
          </div>
          <div className="metric-caption">
            {isApproved
              ? 'Recovery plan approved'
              : isDelayed
              ? 'Recovery ready for review'
              : 'All clear for this shift'}
          </div>
        </div>
      </section>

      {isDelayed && (
        <section
          className={`attention-band ${isApproved ? 'success-band' : ''}`}
        >
          <span className="attention-icon">
            <Icon name={isApproved ? 'check' : 'alert'} />
          </span>
          <div className="attention-copy">
            <h3>
              {isApproved
                ? 'Split delivery approved'
                : 'One delay. Two orders affected.'}
            </h3>
            <p>
              {isApproved
                ? '40 control panels on Nov 25. Remaining 80 on Nov 28.'
                : 'Terminal blocks are late. Control panels are projected 3 days behind.'}
            </p>
          </div>
          <Button
            variant="default"
            iconRight="arrow"
            onClick={() => {
              if (isApproved) {
                setScreen('customer');
              } else {
                openModal('recovery');
              }
            }}
          >
            {isApproved ? 'View updated plan' : 'Review recovery'}
          </Button>
        </section>
      )}

      <div className="content-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Orders</h2>
            </div>
            <label>
              <span className="sr-only">Filter orders</span>
              <input
                className="table-search"
                placeholder="Find an order…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="tabs" role="tablist" aria-label="Order status">
            <button
              type="button"
              className={`tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              role="tab"
              aria-selected={filter === 'all'}
            >
              All orders <span className="tab-count">{orders.length}</span>
            </button>
            <button
              type="button"
              className={`tab ${filter === 'watch' ? 'active' : ''}`}
              onClick={() => setFilter('watch')}
              role="tab"
              aria-selected={filter === 'watch'}
            >
              Needs attention{' '}
              <span className="tab-count">{isDelayed ? 2 : 0}</span>
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>QC-PASSED</th>
                  <th>PROMISED</th>
                  <th>EXPECTED</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Open order</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((o) => {
                    const isWatch = o.status === 'AT_RISK' || o.status === 'WATCH';
                    const isHero = o.id === '1042';
                    const statusVariant =
                      o.status === 'PARTIAL_DELIVERY'
                        ? 'blue'
                        : isWatch
                        ? 'warning'
                        : 'success';

                    const statusLabel =
                      o.status === 'PARTIAL_DELIVERY'
                        ? 'Partial delivery'
                        : o.status === 'AT_RISK'
                        ? 'At risk'
                        : o.status === 'WATCH'
                        ? 'Watch'
                        : o.status === 'READY'
                        ? 'Ready'
                        : 'On track';

                    return (
                      <tr key={o.id}>
                        <td className="order-cell">
                          <strong>{o.number}</strong>
                          <span>{o.partName}</span>
                        </td>
                        <td>
                          <span className="numeric">
                            {o.qcPassedQty} / {o.orderedQty}
                          </span>
                          <div
                            className={`mini-progress ${
                              o.qcPassedQty === o.orderedQty ? 'success' : ''
                            }`}
                          >
                            <span
                              style={{
                                width: `${(o.qcPassedQty / o.orderedQty) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="muted">{formatDateEn(o.promisedDate)}</td>
                        <td className={isWatch ? 'warning-text font-bold' : ''}>
                          <strong>{formatDateEn(o.expectedDate)}</strong>
                          {isHero && isDelayed && !isApproved && (
                            <span className="small"> +3d</span>
                          )}
                        </td>
                        <td>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => {
                              if (o.id === '1042') {
                                setScreen('customer');
                              } else {
                                openModal('order-detail', o);
                              }
                            }}
                            aria-label={`View order ${o.number}`}
                          >
                            <Icon name="chevron" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      No orders match. Try another name or order number.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel-footer">
            <span>6 orders · quantities verified by QC</span>
            <Button
              variant="text"
              iconRight="arrow"
              onClick={() => setScreen('orchestrator')}
            >
              Open orchestrator
            </Button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Capacity this week</h2>
            </div>
            <Badge variant="default">Shift A</Badge>
          </div>
          <div className="panel-body">
            <div className="load-item">
              <div className="between">
                <h4>CNC machining</h4>
                <strong className="small muted">84%</strong>
              </div>
              <div className="load-bar">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} className={i < 17 ? 'filled' : ''} />
                ))}
              </div>
              <div className="between">
                <span className="small muted">128 / 152 h</span>
                <span className="small muted">Available</span>
              </div>
            </div>

            <div className="load-item">
              <div className="between">
                <h4>Assembly</h4>
                <strong className="small warning-text">96%</strong>
              </div>
              <div className="load-bar warning">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} className={i < 19 ? 'filled' : ''} />
                ))}
              </div>
              <div className="between">
                <span className="small muted">144 / 150 h</span>
                <Badge variant="warning">Near capacity</Badge>
              </div>
            </div>

            <div className="load-item">
              <div className="between">
                <h4>Quality control</h4>
                <strong className="small muted">62%</strong>
              </div>
              <div className="load-bar">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} className={i < 12 ? 'filled' : ''} />
                ))}
              </div>
              <div className="between">
                <span className="small muted">74 / 120 h</span>
                <span className="small muted">Available</span>
              </div>
            </div>

            <div className="schedule-note">
              <Icon name="calendar" />
              <div>
                <h4>Next release</h4>
                <p>
                  {isApproved ? '40' : '120'} control panels · Nov 25
                </p>
                <span className="small muted">
                  {isApproved
                    ? 'Split delivery confirmed'
                    : isDelayed
                    ? 'Awaiting recovery approval'
                    : 'Current delivery plan'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>A better estimate next time</h2>
            </div>
            <Button
              variant="text"
              iconRight="arrow"
              onClick={() => openModal('memory')}
            >
              View evidence
            </Button>
          </div>
          <div className="panel-body">
            <div className="memory-evidence">
              <div className="evidence-number">
                +18%
                <span>Bending overrun · 3 prior runs</span>
              </div>
              <div
                className="spark-bars"
                aria-label="Overruns: 15%, 18%, and 21%"
              >
                {[15, 18, 21].map((v, i) => (
                  <div key={i} className="spark-col">
                    <i
                      style={
                        { '--height': `${v * 2.2}px` } as React.CSSProperties
                      }
                    />
                    Run {i + 1}
                  </div>
                ))}
              </div>
            </div>
            <div className="recommendation">
              <Icon name="book" />
              <div>
                <strong>Use routing rev 2. Allow 15% more time.</strong>
                <p>Review before applying to the next bracket order.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent activity</h2>
            </div>
            <Button
              variant="text"
              iconRight="arrow"
              onClick={() => openModal('audit')}
            >
              View log
            </Button>
          </div>
          <div className="panel-body">
            <ul className="activity-list">
              <li>
                <span className="activity-symbol">
                  <Icon name="shield" />
                </span>
                <div className="activity-copy">
                  <p>
                    <strong>78 control panels passed QC</strong>
                  </p>
                  <time className="small muted">
                    Order #1042 · final inspection
                  </time>
                </div>
                <span className="activity-time">09:12</span>
              </li>
              <li>
                <span className="activity-symbol">
                  <Icon name={isApproved ? 'check' : 'alert'} />
                </span>
                <div className="activity-copy">
                  <p>
                    <strong>
                      {isApproved
                        ? 'Split delivery approved'
                        : 'Terminal block delay detected'}
                    </strong>
                  </p>
                  <time className="small muted">
                    {isApproved
                      ? 'Alex Rahman · 40 / 80 units'
                      : '2 orders affected · 3 tasks blocked'}
                  </time>
                </div>
                <span className="activity-time">09:06</span>
              </li>
              <li>
                <span className="activity-symbol">
                  <Icon name="work" />
                </span>
                <div className="activity-copy">
                  <p>
                    <strong>Machining started on chassis brackets</strong>
                  </p>
                  <time className="small muted">Hendra Wijaya · CNC-02</time>
                </div>
                <span className="activity-time">08:42</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
