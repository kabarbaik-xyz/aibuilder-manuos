import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';

export interface LandingFooterProps {
  /** Signed-in visitors get "Open workspace" instead of the Sign In link. */
  authenticated?: boolean;
}

export function LandingFooter({ authenticated = false }: LandingFooterProps = {}) {
  return (
    <footer className="l-footer" aria-label="Site Footer">
      <div className="l-footer-inner">
        <div className="l-footer-top">
          <div className="l-footer-brand-col">
            <Link href="/" className="l-brand" aria-label="ManuOS">
              <div className="l-brand-badge" aria-hidden="true">
                <Icon name="network" className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="l-brand-title">ManuOS</span>
                <span className="l-brand-tagline">Manufacturing Orchestrating System</span>
              </div>
            </Link>
            <p>
              Unified make-to-order orchestration connecting orders, engineering DAGs, double-entry inventory,
              shop-floor execution, and digital product passports.
            </p>
          </div>

          <div className="l-footer-col">
            <h4>Platform</h4>
            <ul className="l-footer-links">
              <li><a href="#flow">8-Stage Lifecycle</a></li>
              <li><a href="#personas">Role Cockpits</a></li>
              <li><a href="#architecture">System Guarantees</a></li>
              <li><a href="#ai-governance">CoreAI Copilot</a></li>
              <li><Link href="/demo">Interactive Demo</Link></li>
            </ul>
          </div>

          <div className="l-footer-col">
            <h4>Workspaces</h4>
            <ul className="l-footer-links">
              <li><Link href="/orders">Order Hub</Link></li>
              <li><Link href="/engineering">Engineering &amp; BOMs</Link></li>
              <li><Link href="/planning">Planning &amp; Roster</Link></li>
              <li><Link href="/shop-floor">Shop Floor Queue</Link></li>
              <li><Link href="/quality/inspections">Quality Control</Link></li>
              <li><Link href="/inventory">Inventory Ledger</Link></li>
            </ul>
          </div>

          <div className="l-footer-col">
            <h4>Access &amp; Portal</h4>
            <ul className="l-footer-links">
              <li>
                <Link href={authenticated ? '/' : '/login'}>
                  {authenticated ? 'Open Workspace' : 'Sign In'}
                </Link>
              </li>
              <li><Link href="/settings/roles">Role-Based Access</Link></li>
              <li><Link href="/portal/orders">Customer Portal</Link></li>
              <li><Link href="/settings/integrations">Integrations &amp; API</Link></li>
            </ul>
          </div>
        </div>

        <div className="l-footer-bottom">
          <div>
            &copy; {new Date().getFullYear()} ManuOS · Manufacturing Orchestrating System.
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <span className="l-live-pulse-dot" />
              Zero-Drift Transactional Ledger
            </span>
            <span className="hidden sm:inline">·</span>
            <span>End-to-End Lot Traceability</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
