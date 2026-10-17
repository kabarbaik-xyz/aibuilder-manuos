'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`l-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="l-nav-inner">
        <Link href="/" className="l-brand" aria-label="ManuOS Homepage">
          <div className="l-brand-badge" aria-hidden="true">
            <Icon name="network" className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="l-brand-title">ManuOS</span>
            <span className="l-brand-tagline">Manufacturing Orchestrating System</span>
          </div>
        </Link>

        {/* Desktop Menu */}
        <nav aria-label="Main navigation">
          <ul className="l-nav-menu">
            <li>
              <a href="#flow" className="l-nav-link">
                Operational Flow
              </a>
            </li>
            <li>
              <a href="#personas" className="l-nav-link">
                Roles
              </a>
            </li>
            <li>
              <a href="#architecture" className="l-nav-link">
                System Invariants
              </a>
            </li>
            <li>
              <a href="#ai-governance" className="l-nav-link">
                AI Governance
              </a>
            </li>
          </ul>
        </nav>

        {/* Action Buttons */}
        <div className="l-nav-actions">
          <ButtonLink
            href="/demo"
            variant="soft"
            size="small"
            id="nav-demo-link"
          >
            Explore Demo
          </ButtonLink>
          <ButtonLink
            href="/login"
            variant="primary"
            size="small"
            id="nav-login-link"
          >
            Sign In
          </ButtonLink>

          <button
            type="button"
            className="l-mobile-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-panel"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-panel"
          className="border-b border-line bg-surface px-6 py-4 lg:hidden"
        >
          <ul className="flex flex-col gap-3 list-none p-0 m-0">
            <li>
              <a
                href="#flow"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Operational Flow
              </a>
            </li>
            <li>
              <a
                href="#personas"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Roles
              </a>
            </li>
            <li>
              <a
                href="#architecture"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                System Invariants
              </a>
            </li>
            <li>
              <a
                href="#ai-governance"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                AI Governance
              </a>
            </li>
            <li className="pt-2 border-t border-line flex flex-col gap-2">
              <ButtonLink
                href="/demo"
                variant="soft"
                className="w-full justify-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Explore Interactive Demo
              </ButtonLink>
              <ButtonLink
                href="/login"
                variant="primary"
                className="w-full justify-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In to Workspace
              </ButtonLink>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
