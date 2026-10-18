'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/resource-state';
import type { UnitPassportDTO } from '@/server/modules/quality/passport';

export function PassportModal({ serial }: { serial: string }) {
  const [passport, setPassport] = useState<UnitPassportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!serial) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setPassport(null);
    void fetch(`/api/passports/${encodeURIComponent(serial)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Passport not available or access not granted.');
        const payload = await response.json() as UnitPassportDTO;
        if (!controller.signal.aborted) setPassport(payload);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Passport tidak dapat dimuat.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serial, reload]);
  const downloadRecord = () => {
    if (!passport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(passport, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Passport-${passport.serialNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!serial) return <EmptyState title="Serial number not selected" description="Open the passport through a unit recorded on an order or inspection." />;
  if (loading) return <p role="status" className="muted">Loading passport evidence…</p>;
  if (error) return <ErrorState title="Passport not available" message={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!passport) return null;
  return <div className="page-stack">
    <div><Badge variant={passport.status === 'RELEASED' ? 'success' : 'warning'}>{passport.status}</Badge><h3>{passport.serialNumber}</h3><p className="small muted">{passport.order?.orderNumber} · {passport.order?.itemName}</p></div>
    {passport.publicationVersion && <p className="small muted">Published v{passport.publicationVersion} · Unit identity with batch job input evidence. Material quantity is total batch consumption, not per-unit allocation.</p>}
    {passport.lot && <p>Lot: <strong>{passport.lot.lotNumber}</strong></p>}
    {passport.qcEvents.length > 0 && <ol className="timeline">{passport.qcEvents.map((event) => <li key={event.inspectionId}><strong>{event.disposition}</strong><time dateTime={event.inspectedAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.inspectedAt))}</time><p>{event.checks.length} checks recorded</p></li>)}</ol>}
    {passport.digestSha256 && <p className="small break-all">SHA-256: <code>{passport.digestSha256}</code></p>}
    <div className="dialog-actions"><ButtonLink href={`/passports/${encodeURIComponent(serial)}`}>View full evidence</ButtonLink><Button icon="download" onClick={downloadRecord}>Download record</Button></div>
  </div>;
}
