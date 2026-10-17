'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ButtonLink } from '@/components/ui/button-link';
import { EmptyState, ErrorState } from '@/components/ui/resource-state';
import { getNotificationHref } from '@/features/notifications/notification-links';
import { NotificationPreferencesDialog } from './notification-preferences-dialog';

type Notification = {
  id: string;
  title: string;
  body: string | null;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  subjectType: string | null;
  subjectId: string | null;
  metadataJson: string | null;
  createdAt: string;
};

type InboxResponse = { data: Notification[]; meta: { unreadCount: number; delivery: { delivered: number; suppressed: number } } };

export function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [suppressedCount, setSuppressedCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notifications?limit=50', { cache: 'no-store' });
      if (!response.ok) throw new Error('Notification tidak dapat dimuat. Coba lagi.');
      const payload = (await response.json()) as InboxResponse;
      setItems(payload.data);
      setUnreadCount(payload.meta.unreadCount);
      setSuppressedCount(payload.meta.delivery.suppressed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Terjadi kesalahan saat memuat notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const markRead = async (notificationId?: string) => {
    setPendingId(notificationId ?? 'all');
    setError(null);
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(notificationId
          ? { action: 'MARK_READ', notificationId }
          : { action: 'MARK_ALL_READ' }),
      });
      if (!response.ok) throw new Error('Status notifications gagal diperbarui. Coba lagi.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Terjadi kesalahan saat memperbarui notifications.');
    } finally {
      setPendingId(null);
    }
  };

  return <>
    <Button
      variant="icon"
      icon="bell"
      aria-label={`Notification${unreadCount ? `, ${unreadCount} unread` : ''}`}
      title="Notification"
      className="notification-trigger"
      onClick={() => setOpen(true)}
    >
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </Button>
    <Dialog
      isOpen={open}
      onClose={() => setOpen(false)}
      title="Notification"
      subtitle={unreadCount ? `${unreadCount} notifications unread` : 'Updates for your account'}
      size="md"
      className="notification-dialog"
      footer={<Button onClick={() => setOpen(false)}>Tutup</Button>}
    >
      <div className="notification-toolbar">
        <Button variant="text" size="small" onClick={() => { setOpen(false); setPreferencesOpen(true); }}>Preferensi</Button>
        <Button variant="text" size="small" disabled={unreadCount === 0 || pendingId !== null} onClick={() => void markRead()}>
          Tandai semua dibaca
        </Button>
      </div>
      {suppressedCount > 0 && <p className="small muted">{suppressedCount} notifications filtered per account preference.</p>}
      {error && <ErrorState title="Notification unavailable" message={error} onRetry={() => void refresh()} />}
      {!error && loading && items.length === 0 && <p className="muted">Loading notifications……</p>}
      {!error && !loading && items.length === 0 && <EmptyState title="No notifications yet" description="Updates sent to your account will appear here.." />}
      {!error && items.length > 0 && <ul className="notification-list">
        {items.map((item) => {
          const href = getNotificationHref(item);
          return <li key={item.id} className={`notification-item ${item.status === 'UNREAD' ? 'unread' : ''}`}>
            <div className="notification-copy">
              <div className="notification-title-row"><strong>{item.title}</strong>{item.status === 'UNREAD' && <Badge variant="blue">Baru</Badge>}</div>
              {item.body && <p>{item.body}</p>}
              {href && <ButtonLink href={href} variant="ghost" size="small">Buka terkait</ButtonLink>}
              <time dateTime={item.createdAt}>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
            </div>
            {item.status === 'UNREAD' && <Button
              variant="icon"
              icon="check"
              aria-label={`Tandai ${item.title} sebagai dibaca`}
              title="Tandai sudah dibaca"
              disabled={pendingId !== null}
              onClick={() => void markRead(item.id)}
            />}
          </li>;
        })}
      </ul>}
      {pendingId && <span className="sr-only" role="status">Memperbarui notifications…</span>}
    </Dialog>
    <NotificationPreferencesDialog isOpen={preferencesOpen} onClose={() => { setPreferencesOpen(false); setOpen(true); }} />
  </>;
}
