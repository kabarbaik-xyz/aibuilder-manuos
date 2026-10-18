'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePaginatedList } from '@/lib/api/use-paginated-list';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/resource-state';
import { useScanBarcode } from '../hooks';
import { getScanOpenPath } from '../scan-routing';
import { QrScannerOverlay } from '@/components/ui/qr-scanner-overlay';
import { useOnlineStatus } from '../use-online-status';

interface WorkItem { id: string; nodeKey: string; nodeName: string; status: string; orderNumber: string; customerName: string; itemName: string; plannedDurationMinutes: number; currentElapsedMinutes: number; canStart: boolean; blockReason?: string }
const filters = [{ value: '', label: 'All active' }, { value: 'RUNNING', label: 'Running' }, { value: 'PAUSED', label: 'Paused' }, { value: 'READY', label: 'Ready' }, { value: 'ASSIGNED', label: 'Assigned' }, { value: 'WAITING_QC', label: 'Waiting QC' }];
function minutes(value: number) { return value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`; }

export function ShopFloorTaskListView() {
  const router = useRouter();
  const { principal } = useWorkspaceNavigation();
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanMutation = useScanBarcode();
  const { data, isPending, error, refetch, pagination } = usePaginatedList<WorkItem, { statusCounts: Record<string, number> }>('my-work', { status, search });
  const counts = data?.summary?.statusCounts || {};
  const supervisor = principal?.permissions.some(permission => ['planning.read', 'task.assign', 'workspace.admin'].includes(permission));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const [showCamera, setShowCamera] = useState(false);
  const handleScanSubmit = async (event?: React.FormEvent<HTMLFormElement>, override?: string) => {
    event?.preventDefault();
    const code = (override ?? scanCode).trim();
    if (!code) return;
    if (!isOnline) {
      setScanMessage('Scanning requires a server connection. Reconnect and try again.');
      return;
    }
    setScanMessage(null);
    try {
      const result = await scanMutation.mutateAsync(code);
      const path = getScanOpenPath(result, principal?.permissions.includes('order.read') ?? false);
      if (path) {
        setScanMessage(null);
        router.push(path);
        return;
      }
      setScanMessage(
        result.type === 'JOB'
          ? `${result.displayCode} found, but no active tasks can be opened.`
          : 'Code recognized, but this account does not have access to open that order.'
      );
    } catch (submitError) {
      setScanMessage(submitError instanceof Error ? submitError.message : 'Code not found or not accessible to this account.');
    }
  };

  return <div className="page-stack my-work-page">
    <PageHeader title="My Tasks" description={supervisor ? 'Review active production tasks in your workspace.' : 'Assigned production tasks.'} actions={<Button icon="reset" disabled={pagination.disabled} onClick={() => void refetch()}>Refresh</Button>} />
    <Tabs
      ariaLabel="Shop floor navigation"
      activeId="all"
      items={[
        { id: 'all', label: 'All tasks', href: '/shop-floor', icon: 'work', count: isPending ? undefined : total },
        { id: 'today', label: 'Work queue', href: '/shop-floor/today', icon: 'clock' },
        { id: 'profile', label: 'My profile', href: '/shop-floor/profile', icon: 'technician' },
      ]}
    />
      <section className="my-work-queue" aria-label="Active production work">
      <div className="my-work-toolbar">
        <div className="my-work-filters" role="group" aria-label="Filter work by status">{filters.map(filter => <button type="button" key={filter.value} aria-pressed={status === filter.value} className={status === filter.value ? 'active' : ''} onClick={() => setStatus(filter.value)}>{filter.label}<span>{isPending ? '—' : filter.value ? counts[filter.value] || 0 : total}</span></button>)}</div>
        <Input type="search" aria-label="Search active work" placeholder="Search order, item, or customer…" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <form className="my-work-scan" aria-label="Open work with a barcode or QR code" onSubmit={handleScanSubmit}>
        <Input type="text" aria-label="Task or job barcode" placeholder="Scan or enter a task / job code" value={scanCode} onChange={event => setScanCode(event.target.value)} />
        <Button type="button" icon="qr" disabled={!isOnline || scanMutation.isPending} onClick={() => setShowCamera(true)}>Scan QR</Button>
        <Button type="submit" variant="primary" disabled={!isOnline || !scanCode.trim() || scanMutation.isPending}>
          {scanMutation.isPending ? 'Checking code…' : 'Open code'}
        </Button>
        {scanMessage && <p role="status" className="my-work-scan-message">{scanMessage}</p>}
        {!isOnline && <p role="status" className="my-work-scan-message">Scanning requires a server connection; this action is not saved while offline.</p>}
      </form>
      <QrScannerOverlay open={showCamera} onClose={() => setShowCamera(false)} onDetect={(code) => { setShowCamera(false); setScanCode(code); void handleScanSubmit(undefined, code); }} />
      {isPending ? <LoadingState message="Loading production work…" /> : error ? <ErrorState message={error.message} onRetry={() => void refetch()} /> : !data?.data.length ? <EmptyState title="No tasks found" description={search || status ? 'Try a different status or search term.' : 'Tasks will appear once production work is assigned.'} /> : <>
        <div className="my-work-column-head" aria-hidden="true"><span>Task & product</span><span>Order & customer</span><span>Time</span><span>Status</span><span /></div>
        <div className="my-work-rows">{data.data.map(task => <article key={task.id} className="my-work-row">
          <div className="my-work-identity"><div className="my-work-task-heading"><h2>{task.nodeName}</h2><span className="my-work-node">{task.nodeKey}</span></div><p>{task.itemName}</p></div>
          <div className="my-work-order"><strong>{task.orderNumber}</strong><p>{task.customerName}</p></div>
          <div className="my-work-time"><strong>{minutes(task.currentElapsedMinutes)} <span>elapsed</span></strong><p>{minutes(task.plannedDurationMinutes)} planned</p></div>
          <div className="my-work-status"><Badge variant={task.status === 'RUNNING' ? 'success' : task.status === 'PAUSED' || task.status === 'WAITING_QC' ? 'warning' : 'default'}>{filters.find(filter => filter.value === task.status)?.label || task.status}</Badge>{task.blockReason && <p>{task.blockReason}</p>}</div>
          <ButtonLink href={`/shop-floor/tasks/${task.id}`} size="small" variant={task.status === 'RUNNING' || task.status === 'PAUSED' ? 'primary' : 'default'}>{task.status === 'RUNNING' ? 'Continue work' : task.status === 'PAUSED' ? 'Review' : 'View task'}</ButtonLink>
        </article>)}</div>
      </>}
      {!error && <Pagination {...pagination} />}
    </section>
  </div>;
}
