'use client';

import React from 'react';
import { Icon } from '@/components/icons';

export function LandingIntegrity() {
  return (
    <section id="architecture" className="l-section l-section-alt" aria-labelledby="integrity-heading">
      <div className="l-section-inner">
        <div className="l-section-header">
          <span className="l-section-tag">Mathematical & Architectural Rigor</span>
          <h2 id="integrity-heading" className="l-section-title">
            Zero floating-point drift. Double-entry balance conservation.
          </h2>
          <p className="l-section-desc">
            Manufacturing demands absolute mathematical integrity. ManuOS is built upon strict invariants
            enforced at the transactional domain boundary and database schema.
          </p>
        </div>

        <div className="l-integrity-grid">
          {/* Invariant 1: Integer Atoms */}
          <div className="l-integrity-card">
            <div className="l-integrity-top">
              <div className="l-integrity-icon" aria-hidden="true">
                <Icon name="ruler" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="l-integrity-title">64-bit Integer Atom Precision</h3>
                <p className="l-integrity-sub">Scale: 1 Display Unit = 1,000,000 Atoms (10⁶)</p>
              </div>
            </div>

            <div className="l-code-callout">
              <div>// Invariant: Exact mass conservation</div>
              <div className="text-primary font-bold">
                inspectedAtoms = passedAtoms + reworkAtoms + scrappedAtoms
              </div>
            </div>

            <p>
              Quantities across intake, bills of materials, reservations, WIP consumption, and finished goods
              are stored and calculated strictly as 64-bit BigInt atoms. Floating-point arithmetic is strictly
              prohibited, eliminating subtle rounding drift across high-volume production runs.
            </p>
          </div>

          {/* Invariant 2: Double-Entry Ledger */}
          <div className="l-integrity-card">
            <div className="l-integrity-top">
              <div className="l-integrity-icon" aria-hidden="true">
                <Icon name="box" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="l-integrity-title">Double-Entry Stock Ledger</h3>
                <p className="l-integrity-sub">Authoritative movements & zero negative balances</p>
              </div>
            </div>

            <div className="l-code-callout">
              <div>// Invariant: Balance projection derived from movements</div>
              <div className="text-primary font-bold">
                totalDebits - totalCredits = currentOnHandAtoms (Discrepancies = 0)
              </div>
            </div>

            <p>
              Every physical movement (receipt, issue to WIP, return, scrap disposition, shipment) writes dual
              debit/credit records in an append-only stock movement ledger. Stock balance records update
              atomically in the same transaction, with non-negative balance checks enforced at all times.
            </p>
          </div>

          {/* Invariant 3: Idempotent Command Pipeline */}
          <div className="l-integrity-card">
            <div className="l-integrity-top">
              <div className="l-integrity-icon" aria-hidden="true">
                <Icon name="lock" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="l-integrity-title">Idempotent Command Pipeline</h3>
                <p className="l-integrity-sub">SHA-256 payload caching & atomic rollback</p>
              </div>
            </div>

            <div className="l-code-callout">
              <div>// Invariant: Replay-safe state transitions</div>
              <div className="text-primary font-bold">
                executeCommand(action, idempotencyKey, payloadHash)
              </div>
            </div>

            <p>
              All mutating business events pass through a centralized command harness. Incoming requests are
              fingerprinted with cryptographic SHA-256 hashes. Network retries safely replay cached responses
              without duplicating production orders, reserving excess inventory, or corrupting state.
            </p>
          </div>

          {/* Invariant 4: Database WAL & Append-Only Audit */}
          <div className="l-integrity-card">
            <div className="l-integrity-top">
              <div className="l-integrity-icon" aria-hidden="true">
                <Icon name="shield" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="l-integrity-title">Append-Only Audit & WAL Persistence</h3>
                <p className="l-integrity-sub">SQLite WAL mode with immutable event triggers</p>
              </div>
            </div>

            <div className="l-code-callout">
              <div>// Invariant: Database triggers block history tampering</div>
              <div className="text-primary font-bold">
                BEFORE UPDATE/DELETE ON audit_events: RAISE(ABORT, &apos;Immutable&apos;)
              </div>
            </div>

            <p>
              Built upon SQLite in WAL mode with strict foreign key constraints and transactional boundaries.
              Database-level triggers reject any mutation or deletion of historical audit logs, ensuring
              full regulatory traceability for every manufacturing order and quality signoff.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
