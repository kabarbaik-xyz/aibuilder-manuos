'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';

export default function PassportPage() {
  const params = useParams();
  const rawSerial = Array.isArray(params?.serial) ? params.serial[0] : (params?.serial as string) || 'SN-1042-078';
  const decodedSerial = decodeURIComponent(rawSerial);

  const customBreadcrumb = (
    <>
      <Link href="/" className="hover:underline">
        Traceability
      </Link>
      <span className="breadcrumb-factory">/</span>
      <strong>Passport · {decodedSerial}</strong>
    </>
  );

  return (
    <AppShell breadcrumb={customBreadcrumb} activeTitle="Digital Passport">
      <div>
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2">
              <h1>Unit digital passport</h1>
              <Badge variant="blue">{decodedSerial}</Badge>
              <Badge variant="success">QC Verified</Badge>
            </div>
            <p>ISO 9001 Compliant Traceability Record · Cryptographically anchored in ManuOS Operational Graph.</p>
          </div>
          <div className="actions">
            <Link href="/" className="btn">
              <Icon name="arrow" className="rotate-180" />
              Back to command center
            </Link>
          </div>
        </div>

        <div className="content-grid">
          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Verification & Material Traceability</h3>
                  <p>Certified unit credentials and production batch provenance</p>
                </div>
                <Badge variant="success">Pass QC</Badge>
              </div>

              <div className="panel-body">
                <div className="spec-row">
                  <span>Unit Serial Number</span>
                  <strong>{decodedSerial}</strong>
                </div>
                <div className="spec-row">
                  <span>Originating Order</span>
                  <strong>#CO-2026-1042</strong>
                </div>
                <div className="spec-row">
                  <span>Material Lot Number</span>
                  <strong>AL-89240 (Aluminum 6061-T6)</strong>
                </div>
                <div className="spec-row">
                  <span>Lead QA Auditor</span>
                  <strong>Siti Nurhaliza (Lead Metrologist)</strong>
                </div>
                <div className="spec-row">
                  <span>Cryptographic Hash</span>
                  <code className="bg-[var(--surface-muted)] px-1.5 py-0.5 rounded text-[11px] border border-[var(--line)]">
                    sha256:7f9a8b1c4d2e99a3...
                  </code>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Manufacturing & Inspection Timeline</h3>
                  <p>Immutable event sequence recorded on the shop floor</p>
                </div>
              </div>

              <div className="panel-body">
                <ol className="timeline">
                  <li>
                    <div className="between">
                      <h3>Material Inbound Inspection Verified</h3>
                      <time>Nov 18 · 08:34</time>
                    </div>
                    <p>6061-T6 Aluminum · Lot AL-89240 mill test report verified and stamped.</p>
                  </li>
                  <li>
                    <div className="between">
                      <h3>5-Axis CNC Machining</h3>
                      <time>Nov 19 · 14:12</time>
                    </div>
                    <p>Hendra Wijaya · CNC-02 · Drawing rev 2 · Cycle 4h 15m.</p>
                  </li>
                  <li className="warning">
                    <div className="between">
                      <h3>Dimensional Inspection & Corrective Rework</h3>
                      <time>Nov 20 · 10:45</time>
                    </div>
                    <p>
                      Bend angle 91.5° deviated from 90° ±0.5° nominal. Corrected on press brake and reinspected to 90.1°.
                    </p>
                    <Badge variant="warning">Rework Passed</Badge>
                  </li>
                  <li>
                    <div className="between">
                      <h3>Final Quality Assurance Sign-Off</h3>
                      <time>Nov 22 · 11:05</time>
                    </div>
                    <p>Lead Auditor Siti Nurhaliza signed off final CMM report. Packaged for delivery.</p>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Digital Seal</h3>
                  <p>Scan to verify authenticity</p>
                </div>
                <Icon name="shield" className="text-muted" />
              </div>
              <div className="panel-body">
                <div className="qr-wrap">
                  <div className="qr border border-[var(--line)] rounded-lg p-2 bg-white flex items-center justify-center">
                    <Icon name="shield" className="w-12 h-12 text-[var(--primary)]" />
                  </div>
                  <div>
                    <strong>Immutable Audit Anchor</strong>
                    <p>Verified on Precision Works edge ledger node.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Traceability Actions</h3>
                </div>
              </div>
              <div className="panel-body">
                <div className="stack gap-2">
                  <Link href="/" className="btn primary full">
                    Open in Operational Graph
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.print();
                    }}
                    className="btn full"
                  >
                    <Icon name="file" />
                    Print Certificate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
