import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';

export function LandingFooter() {
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
                <span className="l-brand-tagline">Manufacturing Orchestration</span>
              </div>
            </Link>
            <p>
              An authoritative manufacturing operating system connecting orders, engineering DAG workflows,
              double-entry inventory ledgers, shop floor execution, and immutable product passports.
            </p>
          </div>

          <div className="l-footer-col">
            <h4>Platform</h4>
            <ul className="l-footer-links">
              <li><a href="#flow">Operational Flow</a></li>
              <li><a href="#personas">Role Cockpits</a></li>
              <li><a href="#architecture">Mathematical Invariants</a></li>
              <li><a href="#ai-governance">AI Governance</a></li>
              <li><Link href="/demo">Interactive Demo</Link></li>
            </ul>
          </div>

          <div className="l-footer-col">
            <h4>Workspaces</h4>
            <ul className="l-footer-links">
              <li><Link href="/orders">Order Hub</Link></li>
              <li><Link href="/engineering">Engineering & BOMs</Link></li>
              <li><Link href="/planning">Planning & Roster</Link></li>
              <li><Link href="/shop-floor">Shop Floor Workstations</Link></li>
              <li><Link href="/quality/inspections">Quality Control</Link></li>
              <li><Link href="/inventory">Inventory & Ledger</Link></li>
            </ul>
          </div>

          <div className="l-footer-col">
            <h4>Security & Access</h4>
            <ul className="l-footer-links">
              <li><Link href="/login">Secure Sign In</Link></li>
              <li><Link href="/settings/roles">Role-Based Access Control</Link></li>
              <li><Link href="/portal/orders">Customer Portal</Link></li>
              <li><Link href="/settings/integrations">Integrations & API</Link></li>
            </ul>
          </div>
        </div>

        <div className="l-footer-bottom">
          <div>
            &copy; {new Date().getFullYear()} ManuOS. All rights reserved. Strict Light Theme &amp; Integer Precision Invariant.
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              SQLite WAL Active
            </span>
            <span>·</span>
            <span>WCAG 2.1 AA Compliant</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
