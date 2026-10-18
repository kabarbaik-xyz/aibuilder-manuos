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
        throw new Error(payload?.error?.message || 'Passport change failed. Check QC results, facility access, and connection.');
      }
      onChanged(); setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Passport change failed.'); }
    finally { setPending(false); }
  };
  return <>
    <div className="page-header-actions">
      {published && <ButtonLink href={`/passports/${encodeURIComponent(serialNumber)}`}>Open passport · {serialNumber}</ButtonLink>}
      {canPublish && <Button onClick={() => { setError(null); setAction(published ? shared ? 'REVOKE' : 'SHARE' : 'PUBLISH'); }}>
        {published ? shared ? 'Revoke customer access' : 'Share with customer' : 'Publish unit passport'}
      </Button>}
    </div>
    <Dialog isOpen={action !== null} onClose={() => setAction(null)} title={action === 'PUBLISH' ? 'Publish passport snapshot' : action === 'SHARE' ? 'Share passport with customer' : 'Revoke customer access'} size="sm" pending={pending}
      footer={<><Button data-dialog-dismiss disabled={pending}>Cancel</Button><Button variant="primary" disabled={pending} onClick={() => void submit()}>{pending ? 'Processing…' : action === 'PUBLISH' ? 'Publish' : action === 'SHARE' ? 'Share' : 'Revoke'}</Button></>}>
      <div className="page-stack">
        <p>Nomor seri: <strong>{serialNumber}</strong></p>
        <p>{action === 'PUBLISH'
          ? 'The server verifies output identity and QC receipt, then stores an immutable snapshot with a content hash. Material quantity is labeled as total batch job consumption. The customer gets access after you choose Share.'
          : action === 'SHARE' ? 'The customer who owns the order can read this snapshot. Your action and identity are recorded.'
          : 'The customer can no longer open this passport. The snapshot and publication history remain stored.'}</p>
        {error && <p className="text-danger" role="alert">{error}</p>}
      </div>
    </Dialog>
  </>;
}
