'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { getMasterNavigation, getWorkflowNavigation, isMasterNavActive } from '@/lib/master-navigation';
import type { PrincipalJson } from '@/server/auth/principal';
import { useGraphStore } from '@/store/graph-store';
import { Icon } from './icons';

export function MasterNavigation() {
  const pathname = usePathname();
  const closeNavMenu = useGraphStore((state) => state.closeNavMenu);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => apiRequest<{ data: PrincipalJson }>('/api/me'),
    retry: false,
  });

  if (isPending) return <p className="small muted px-4" role="status">Loading workspace access…</p>;
  if (error) {
    return (
      <nav className="nav-list" aria-label="Workspace access">
        {error instanceof ApiError && error.statusCode === 401 ? (
          <Link className="nav-item" href="/login" onClick={closeNavMenu}>
            <Icon name="user" /><span>Sign in to workspace</span>
          </Link>
        ) : (
          <button className="nav-item" type="button" onClick={() => refetch()}>
            <Icon name="reset" /><span>Retry workspace access</span>
          </button>
        )}
      </nav>
    );
  }

  const permissions = data?.data.permissions ?? [];
  const workflowItems = getWorkflowNavigation(permissions);
  const masterItems = getMasterNavigation(permissions);

  return (
    <>
      {workflowItems.length > 0 && (
        <>
          <div className="nav-group-label">Operations</div>
          <nav className="nav-list" aria-label="Operations">
            {workflowItems.map((item) => {
              const active = isMasterNavActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} onClick={closeNavMenu}
                  className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon name={item.href.includes('order') ? 'box' : item.href.includes('engineering') ? 'brain' : 'route'} />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
          <div className="nav-divider" />
        </>
      )}

      {masterItems.length > 0 && (
        <>
          <div className="nav-group-label">Master data</div>
          <nav className="nav-list" aria-label="Master data">
            {masterItems.map((item) => {
              const active = isMasterNavActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} onClick={closeNavMenu}
                  className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon name="settings" /><span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
          <div className="nav-divider" />
        </>
      )}
    </>
  );
}
