'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Dialog } from '@/components/ui/dialog';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';

export function PassportPublicationActions({ serialNumber, itemId, orderId, published, shared, onChanged }: {
  serialNumber: string; itemId: string; orderId?: string; published: boolean; shared: boolean; onChanged: () => void;
}) {
  const { principal } = useWorkspaceNavigation();
  const [action, setAction] = useState<'PUBLISH' | 'SHARE' | 'REVOKE' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPublish = !principal?.customerId && ['quality.inspect', 'delivery.dispatch', 'admin.access'].some((permission) => principal?.permissions.includes(permission));
  const submit = async () => {
    if (!action || pending) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(action === 'PUBLISH' ? '/api/passports/publish' : `/api/passports/${encodeURIComponent(serialNumber)}/sharing`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(action === 'PUBLISH' ? { serialNumber, itemId, orderId } : { action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || 'Perubahan passport gagal. Periksa hasil QC, akses facility, dan koneksi.');
      }
      onChanged(); setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Perubahan passport gagal.'); }
    finally { setPending(false); }
  };
  return <>
    <div className="page-header-actions">
      {published && <ButtonLink href={`/passports/${encodeURIComponent(serialNumber)}`}>Buka passport · {serialNumber}</ButtonLink>}
      {canPublish && <Button onClick={() => { setError(null); setAction(published ? shared ? 'REVOKE' : 'SHARE' : 'PUBLISH'); }}>
        {published ? shared ? 'Cabut akses customer' : 'Bagikan ke customer' : 'Publikasikan passport unit'}
      </Button>}
    </div>
    <Dialog isOpen={action !== null} onClose={() => setAction(null)} title={action === 'PUBLISH' ? 'Publikasikan snapshot passport' : action === 'SHARE' ? 'Bagikan passport ke customer' : 'Cabut akses customer'} size="sm" pending={pending}
      footer={<><Button data-dialog-dismiss disabled={pending}>Batal</Button><Button variant="primary" disabled={pending} onClick={() => void submit()}>{pending ? 'Memproses…' : action === 'PUBLISH' ? 'Publikasikan' : action === 'SHARE' ? 'Bagikan' : 'Cabut akses'}</Button></>}>
      <div className="page-stack">
        <p>Nomor seri: <strong>{serialNumber}</strong></p>
        <p>{action === 'PUBLISH'
          ? 'Server memeriksa identitas output dan penerimaan QC, lalu menyimpan snapshot tetap beserta hash isi. Kuantitas material diberi label total konsumsi batch job. Customer mendapat akses setelah Anda memilih Bagikan.'
          : action === 'SHARE' ? 'Customer pemilik order dapat membaca snapshot ini. Tindakan dan identitas Anda dicatat.'
          : 'Customer tidak dapat lagi membuka passport ini. Snapshot dan riwayat publikasi tetap tersimpan.'}</p>
        {error && <p className="text-danger" role="alert">{error}</p>}
      </div>
    </Dialog>
  </>;
}
