'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/resource-state';
import { NOTIFICATION_CATEGORIES, type NotificationPreferences } from '@/server/modules/notifications/contracts';

const labels: Record<keyof NotificationPreferences, string> = {
  ASSIGNMENT: 'Work assignment', RELEASE: 'Order release', APPROVAL: 'Engineering approval',
  BLOCKER: 'Issue and blocker', GENERAL: 'Other updates',
};
type PreferenceState = { preferences: NotificationPreferences; version: number };

export function NotificationPreferencesDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [saved, setSaved] = useState<PreferenceState | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setSuccess(false); setSaved(null); setPreferences(null);
    void fetch('/api/notifications/preferences', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Preferences could not be loaded.');
        const payload = await response.json() as { data: PreferenceState };
        if (!controller.signal.aborted) { setSaved(payload.data); setPreferences(payload.data.preferences); }
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Preferences could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOpen, reload]);

  const dirty = Boolean(saved && preferences && JSON.stringify(saved.preferences) !== JSON.stringify(preferences));
  const save = async () => {
    if (!saved || !preferences || pending) return;
    setPending(true); setError(null); setSuccess(false);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ preferences, expectedVersion: saved.version }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? 'Preferences changed. Reload before saving.' : 'Preferences could not be saved. Try again.');
      const payload = await response.json() as { data: PreferenceState };
      setSaved(payload.data); setPreferences(payload.data.preferences); setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Preferences could not be saved.'); }
    finally { setPending(false); }
  };

  return <Dialog isOpen={isOpen} onClose={onClose} title="Notification preferences" size="sm" pending={pending} dirty={dirty}
    subtitle="Updates reaching your inbox in this workspace."
    footer={<><Button data-dialog-dismiss disabled={pending}>Close</Button><Button variant="primary" disabled={!dirty || pending || loading} onClick={() => void save()}>{pending ? 'Saving…' : 'Save preferences'}</Button></>}>
    <div className="page-stack">
      {loading && <p className="muted" role="status">Loading preferences…</p>}
      {error && <ErrorState title="Preferences not updated" message={error} onRetry={() => setReload((value) => value + 1)} />}
      {preferences && NOTIFICATION_CATEGORIES.map((category) => <FormField key={category} id={`notification-${category}`} label={labels[category]}>
        <Input type="checkbox" checked={preferences[category]} disabled={pending} onChange={(event) => {
          setPreferences({ ...preferences, [category]: event.target.checked }); setSuccess(false);
        }} />
      </FormField>)}
      <p className="small muted">Changes apply to future notifications. Tasks and issues remain available on the operational page even if notifications are filtered.</p>
      {success && <p role="status">Preferences saved.</p>}
    </div>
  </Dialog>;
}
