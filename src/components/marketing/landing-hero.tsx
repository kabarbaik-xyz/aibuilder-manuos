'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

const STATS = [
  { value: '10⁶', label: 'Integer precision' },
  { value: '0', label: 'Ledger drift' },
  { value: '8', label: 'Connected stages' },
  { value: '1', label: 'Source of truth' },
];

export function LandingHero() {
  const [rerouted, setRerouted] = useState(false);

  return (
    <section className="l-hero-min" aria-labelledby="hero-heading">
      <div className="l-hero-min-inner">
        <p className="l-hero-eyebrow">Manufacturing Orchestrating System</p>

        <h1 id="hero-heading" className="l-hero-min-title">
          Every order, from RFQ to delivery.
        </h1>

        <p className="l-hero-min-sub">One system for orders, engineering, floor, quality, and shipment.</p>

        <div className="l-hero-min-actions">
          <ButtonLink
            href="/demo"
            variant="primary"
            id="hero-demo-button"
            className="flex items-center gap-2"
          >
            <span>Launch demo</span>
            <Icon name="arrow" className="w-4 h-4" />
          </ButtonLink>
          <ButtonLink href="/login" variant="default" id="hero-signin-button">
            Sign in
          </ButtonLink>
        </div>

        {/* Product visual: one minimal routing graph */}
        <div className="l-hero-card" aria-label="Order routing preview">
          <div className="l-hero-card-head">
            <div className="l-hero-card-order">
              <span className="l-hero-card-id">MO-2026-8812</span>
              <span className="l-hero-card-name">Servo Mount · 120 units</span>
            </div>
            <span className={`l-hero-card-status ${rerouted ? 'ok' : 'risk'}`}>
              <span className="l-hero-card-status-dot" aria-hidden="true" />
              {rerouted ? 'On track' : 'At risk'}
            </span>
          </div>

          <div className="l-hero-board-scroll">
            <div className="l-hero-board" role="img" aria-label="Routing graph: receive, cut, mill, inspect, ship">
              <div className="l-hn done">
                <span className="l-hn-code">01</span>
                <span className="l-hn-name">Receive</span>
                <span className="l-hn-meta">Lot verified</span>
              </div>

              <span className="l-hl done" aria-hidden="true" />

              <div className="l-hn done">
                <span className="l-hn-code">02</span>
                <span className="l-hn-name">Cut</span>
                <span className="l-hn-meta">120 / 120</span>
              </div>

              <span className={`l-hl fork ${rerouted ? 'flow' : ''}`} aria-hidden="true" />

              <div className="l-hn-stack">
                <div className={`l-hn ${rerouted ? 'active' : 'delay'}`}>
                  <span className="l-hn-code">03A</span>
                  <span className="l-hn-name">Mill</span>
                  <span className="l-hn-meta">{rerouted ? '80 units' : '+42 min'}</span>
                </div>
                <div className={`l-hn ${rerouted ? 'active' : 'idle'}`}>
                  <span className="l-hn-code">03B</span>
                  <span className="l-hn-name">Mill</span>
                  <span className="l-hn-meta">{rerouted ? '40 units' : 'Standby'}</span>
                </div>
              </div>

              <span className={`l-hl join ${rerouted ? 'flow' : ''}`} aria-hidden="true" />

              <div className="l-hn idle">
                <span className="l-hn-code">04</span>
                <span className="l-hn-name">Inspect</span>
                <span className="l-hn-meta">Gate armed</span>
              </div>

              <span className="l-hl idle" aria-hidden="true" />

              <div className="l-hn idle">
                <span className="l-hn-code">05</span>
                <span className="l-hn-name">Ship</span>
                <span className="l-hn-meta">Fri 16:00</span>
              </div>
            </div>
          </div>

          <div className="l-hero-card-foot">
            <span className="l-hero-card-hint">
              {rerouted ? 'Reroute approved by supervisor' : 'Milling is 42 min behind plan'}
            </span>
            <button
              type="button"
              className={`btn small-btn ${rerouted ? '' : 'primary'}`}
              onClick={() => setRerouted((v) => !v)}
            >
              {rerouted ? (
                'Reset'
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" />
                  <span>Approve reroute</span>
                </>
              )}
            </button>
          </div>
        </div>

        <dl className="l-hero-stats">
          {STATS.map((s) => (
            <div key={s.label} className="l-hero-stat">
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
