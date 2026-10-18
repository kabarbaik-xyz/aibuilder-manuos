'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';
import { getFunctionalNavigation, isMasterNavActive, type MasterNavItem } from '@/lib/master-navigation';
import { paginatedListQueryOptions } from '@/lib/api/use-paginated-list';
import { useUiStore } from '@/store/ui-store';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { Icon } from './icons';

interface ListPrefetchTarget {
  resource: string;
  filters: Record<string, string | undefined>;
}

// Warm only the default first page for routes backed by the shared paginated
// list query. Forms with multiple dependent queries and detail routes stay out.
const LIST_PREFETCH_BY_HREF: Record<string, ListPrefetchTarget> = {
  '/orders': { resource: 'orders', filters: { search: undefined } },
  '/engineering': { resource: 'engineering', filters: { search: undefined } },
  '/supply-orders': { resource: 'supply-orders', filters: { search: undefined } },
  '/inventory/items': { resource: 'items', filters: { search: undefined, type: undefined } },
  '/inventory/receipts': { resource: 'receipts', filters: { search: undefined } },
  '/inventory': { resource: 'stock-balances', filters: { search: '', kind: '' } },
  '/planning': { resource: 'planning', filters: { search: undefined } },
  '/shop-floor': { resource: 'my-work', filters: { status: '', search: '' } },
  '/quality/inspections': { resource: 'inspections', filters: { status: '', search: undefined } },
  '/delivery/shipments': { resource: 'shipments', filters: { status: '', search: undefined } },
  '/portal/orders': { resource: 'portal-orders', filters: { search: undefined } },
  '/settings/customers': { resource: 'customers', filters: { search: undefined } },
  '/settings/suppliers': { resource: 'suppliers', filters: { search: undefined } },
  '/settings/units': { resource: 'uoms', filters: { search: undefined } },
  '/settings/locations': { resource: 'locations', filters: { type: undefined, search: undefined } },
  '/settings/departments': { resource: 'departments', filters: { search: undefined } },
  '/settings/machines': { resource: 'machines', filters: { search: undefined } },
  '/settings/technicians': { resource: 'technicians', filters: { search: undefined } },
  '/settings/calendars': { resource: 'calendars', filters: { search: undefined } },
  '/settings/skills-certifications': { resource: 'skills', filters: { search: undefined } },
  '/settings/order-types': { resource: 'order-types', filters: { search: undefined } },
  '/settings/qc-checklists': { resource: 'qc-checklists', filters: { search: undefined } },
  '/settings/forms': { resource: 'forms', filters: { search: '', purpose: '' } },
};

function NavigationLink({
  item,
  activeHref,
  onPrefetch,
  onNavigate,
}: {
  item: MasterNavItem;
  activeHref?: string;
  onPrefetch: (href: string) => void;
  onNavigate: () => void;
}) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverPrefetch = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={() => {
        cancelHoverPrefetch();
        hoverTimer.current = setTimeout(() => onPrefetch(item.href), 140);
      }}
      onMouseLeave={cancelHoverPrefetch}
      onFocus={() => onPrefetch(item.href)}
      onTouchStart={() => onPrefetch(item.href)}
      className={`nav-item ${item.href === activeHref ? 'active' : ''}`}
      aria-current={item.href === activeHref ? 'page' : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.title}</span>
    </Link>
  );
}

function NavigationGroup({
  id,
  title,
  items,
  activeHref,
  onPrefetch,
}: {
  id: string;
  title: string;
  items: readonly MasterNavItem[];
  activeHref?: string;
  onPrefetch: (href: string) => void;
}) {
  const active = items.some(item => item.href === activeHref);
  const [open, setOpen] = useState(true);
  const close = useUiStore(state => state.closeNavMenu);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`nav-function-${id}`);
      if (saved !== null) setOpen(active || saved === 'open');
    } catch {
      // Navigation remains usable when storage is unavailable.
    }
  }, [id, active]);

  if (!items.length) return null;

  return (
    <section className="navigation-group">
      <button
        type="button"
        className="nav-group-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          try {
            localStorage.setItem(`nav-function-${id}`, next ? 'open' : 'closed');
          } catch {
            // Keep the current expansion state even if it cannot be persisted.
          }
        }}
      >
        {title}
        <Icon name="down" className={open ? '' : 'nav-group-closed'} />
      </button>
      {open && (
        <nav className="nav-list" aria-label={title}>
          {items.map(item => (
            <NavigationLink
              key={item.href}
              item={item}
              activeHref={activeHref}
              onPrefetch={onPrefetch}
              onNavigate={close}
            />
          ))}
        </nav>
      )}
    </section>
  );
}

export function MasterNavigation() {
  const { principal, pathname, error, isPending, refetch } = useWorkspaceNavigation();
  const close = useUiStore(state => state.closeNavMenu);
  const queryClient = useQueryClient();

  const prefetchList = useCallback((href: string) => {
    const target = LIST_PREFETCH_BY_HREF[href];
    if (!principal || !target || pathname === href) return;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return;

    const options = paginatedListQueryOptions(
      target.resource,
      principal,
      target.filters,
    );
    void queryClient.query(options).catch(() => undefined);
  }, [pathname, principal, queryClient]);

  if (isPending) return <p className="small muted px-4" role="status">Loading workspace…</p>;
  if (error) {
    return (
      <nav className="nav-list" aria-label="Workspace access">
        {error instanceof ApiError && error.statusCode === 401 ? (
          <Link href="/login" className="nav-item" onClick={close}>
            <Icon name="user" />Sign in to workspace
          </Link>
        ) : (
          <button type="button" className="nav-item" onClick={() => refetch()}>
            <Icon name="reset" />Retry workspace access
          </button>
        )}
      </nav>
    );
  }

  const permissions = principal?.permissions ?? [];
  const roles = principal?.roles ?? [];
  const groups = getFunctionalNavigation(permissions, roles, principal?.customerId);
  // Prefer the deepest matching route so Inventory is not also highlighted
  // while visiting Items or Inbound Receipts.
  const activeHref = groups
    .flatMap(group => group.items)
    .filter(item => isMasterNavActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {groups.map(group => (
        <NavigationGroup
          key={group.id}
          id={group.id}
          title={group.title}
          items={group.items}
          activeHref={activeHref}
          onPrefetch={prefetchList}
        />
      ))}
    </>
  );
}
