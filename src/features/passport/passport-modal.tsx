'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

export function PassportModal({ serial = 'SN-1042-078' }: { serial?: string }) {
  const store = useGraphStore();
  const { closeModal } = store;

  const downloadRecord = () => {
    const text = `MANUOS · UNIT PASSPORT TRACEABILITY RECORD\nSerial Number: ${serial}\nOrder: #CO-2026-1042\nMaterial Lot: AL-89240 (Aluminum 6061-T6 MTR Verified)\nStatus: QC Passed (Rework Corrected)\nSign-off: Siti Nurhaliza (ISO 9001 Lead Auditor)\nTimestamp: 2026-11-22T11:05:00Z\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Passport-${serial}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.showToast('Unit passport record downloaded.');
  };

  return (
    <div>
      <div className="passport-detail-head">
        <Icon name="shield" className="w-8 h-8 text-primary" />
        <div>
          <strong>QC verified · Ready for shipment</strong>
          <p>Aluminum 6061-T6 · Material lot AL-89240</p>
        </div>
      </div>

      <ol className="timeline">
        <li>
          <div className="between">
            <h3>Material verified</h3>
            <time>Nov 18 · 08:34</time>
          </div>
          <p>6061-T6 · Lot AL-89240 incoming inspection verified</p>
        </li>
        <li>
          <div className="between">
            <h3>CNC machining complete</h3>
            <time>Nov 19 · 14:12</time>
          </div>
          <p>Hendra Wijaya · CNC-02 · Drawing rev 2</p>
        </li>
        <li className="warning">
          <div className="between">
            <h3>Inspection & rework</h3>
            <time>Nov 20 · 10:45</time>
          </div>
          <p>
            Bend angle 91.5° outside tolerance. Corrected on press brake and
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
          <p>Signed off by Siti Nurhaliza. Unit serial 078.</p>
        </li>
      </ol>

      <p className="approval-note">
        Manufacturing passport traceability. Verifies material origin, machine logs, and rework correction.
      </p>

      <div className="dialog-actions mt flex items-center gap-2">
        <a
          href={`/passports/${encodeURIComponent(serial)}`}
          className="btn primary flex-1 text-center"
          target="_blank"
          rel="noreferrer"
        >
          Open Certified Passport →
        </a>
        <Button variant="default" icon="download" onClick={downloadRecord}>
          Download record
        </Button>
      </div>
    </div>
  );
}
