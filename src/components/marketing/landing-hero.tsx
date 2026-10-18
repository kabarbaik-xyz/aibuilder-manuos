'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ROWS = ['Laser', 'CNC-01', 'CNC-02', 'Inspect'];

export function LandingHero() {
  const [rerouted, setRerouted] = useState(false);
  const millRow = rerouted ? 2 : 1;

  return (
    <section className="l-hero-v3" aria-labelledby="hero-heading">
      <div className="l-hero-v3-inner">
        <div className="l-hero-v3-copy">
          <h1 id="hero-heading" className="l-hero-v3-title">
            Run your factory <span>with CoreAI by your side.</span>
          </h1>
          <p className="l-hero-v3-sub">Ask questions about your operations, see delivery risks, and review practical recovery options—all connected to your manufacturing records.</p>
          <p className="l-hero-v3-assurance">Grounded in your records. Reviewed by your team.</p>
          <div className="l-hero-v3-actions">
            <ButtonLink
              href="/demo"
              variant="primary"
              id="hero-demo-button"
              className="flex items-center gap-2"
            >
              <span>Explore CoreAI demo</span>
              <Icon name="arrow" className="w-4 h-4" />
            </ButtonLink>
            <ButtonLink href="/login" variant="default" id="hero-signin-button">
              Sign In
            </ButtonLink>
          </div>
        </div>

        <div
          className="l-gt-card"
          aria-label="Illustrative CoreAI schedule preview"
        >
          <div className="l-gt-head">
            <div className="l-gt-title">
              <strong>CoreAI schedule review</strong>
              <span>Illustrative example</span>
            </div>
            <span className={`l-gt-chip ${rerouted ? 'ok' : 'risk'}`}>
              <i aria-hidden="true" />
              Ship Fri 16:00 · {rerouted ? 'Proposed' : 'At risk'}
            </span>
          </div>

          <div className="l-gt-scroll">
            <div className="l-gt-grid">
              <div className="l-gt-corner" />
              <div className="l-gt-days">
                {DAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="l-gt-labels">
                {ROWS.map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>

              <div className="l-gt-track">
                <div className="l-gt-now" style={{ left: '40%' }}>
                  <em>Now</em>
                </div>
                <div className="l-gt-deadline" style={{ left: '92%' }} />

                {/* Laser */}
                <div className="l-gt-bar done" style={{ left: '0%', width: '19%', top: 0 }}>
                  <span>MO-8810</span>
                </div>
                <div className="l-gt-bar done" style={{ left: '21%', width: '17%', top: 0 }}>
                  <span>8812 · Cut</span>
                </div>

                {/* CNC-01 */}
                <div className="l-gt-bar done" style={{ left: '0%', width: '30%', top: 56 }}>
                  <span>MO-8809</span>
                </div>

                {/* CNC-02 */}
                <div className="l-gt-bar neutral" style={{ left: '8%', width: '26%', top: 112 }}>
                  <span>MO-8815</span>
                </div>

                {/* The mill operation: moves between machines */}
                <div
                  className={`l-gt-bar mill ${rerouted ? 'ok' : 'delay'}`}
                  style={{
                    left: '40%',
                    width: rerouted ? '24%' : '38%',
                    top: millRow * 56,
                  }}
                >
                  <span>8812 · Mill</span>
                  {!rerouted && <b>+42m</b>}
                </div>

                {/* Inspect */}
                <div
                  className={`l-gt-bar qc ${rerouted ? 'ok' : 'delay'}`}
                  style={{
                    left: rerouted ? '66%' : '80%',
                    width: '16%',
                    top: 168,
                  }}
                >
                  <span>8812 · QC</span>
                </div>
              </div>
            </div>
          </div>

          <div className="l-gt-foot">
            <span className="l-gt-note">
              {rerouted ? 'Preview: mill moved to CNC-02' : 'Example: review CNC-02 availability'}
            </span>
            <button
              type="button"
              className={`btn small-btn ${rerouted ? '' : 'primary'}`}
              onClick={() => setRerouted((v) => !v)}
            >
              {rerouted ? (
                'Reset preview'
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" />
                  <span>Preview reassignment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
