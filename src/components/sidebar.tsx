'use client';
import Link from 'next/link';
import { BrandLogo } from './brand-logo';
import { useUiStore } from '@/store/ui-store';
import { Icon } from './icons';
import { MasterNavigation } from './master-navigation';

export interface SidebarProps {
  /** Workspace/factory display name shown under the brand. */
  factoryName: string;
  /** Small caption under the factory name (e.g. "Manufacturing workspace"). */
  factoryTagline: string;
  /** Brand link target; defaults to the platform root. */
  brandHref?: string;
  /** Navigation node; defaults to the production MasterNavigation. */
  nav?: React.ReactNode;
  /** Footer node; defaults to the production role-access footnote. */
  bottom?: React.ReactNode;
}

/**
 * Shared sidebar shell. Presentation only: callers supply the navigation and
 * factory identity so production and the demo simulation compose their own
 * content without pathname detection inside this component.
 */
export function Sidebar({
  factoryName,
  factoryTagline,
  brandHref = '/',
  nav,
  bottom,
}: SidebarProps) {
  const { isNavMenuOpen, closeNavMenu } = useUiStore();
  return (
    <aside className={`sidebar ${isNavMenuOpen ? 'open' : ''}`} id="sidebar" aria-label="Main navigation">
      <div className="sidebar-heading">
        <Link className="brand" href={brandHref} onClick={closeNavMenu} aria-label="ManuOS home">
          <BrandLogo className="w-36" />
        </Link>
        <div className="factory-switch">
          <span className="factory-mark">
            <Icon name="factory" />
          </span>
          <div>
            <strong>{factoryName}</strong>
            <span className="small muted">{factoryTagline}</span>
          </div>
        </div>
      </div>
      <div className="sidebar-nav-scroll">{nav ?? <MasterNavigation />}</div>
      {bottom ?? (
        <div className="sidebar-footnote">
          <Icon name="shield" />
          <span>Access follows your workspace role</span>
        </div>
      )}
    </aside>
  );
}
