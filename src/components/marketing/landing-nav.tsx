'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

export interface LandingNavProps {
  /** Signed-in visitors get "Open workspace" instead of the Sign In CTA. */
  authenticated?: boolean;
}

export function LandingNav({ authenticated = false }: LandingNavProps = {}) {
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
          <BrandLogo className="w-36 sm:w-40" />
        </Link>

        {/* Desktop Menu */}
        <nav aria-label="Main navigation">
          <ul className="l-nav-menu">
<li>
              <a href="#ai-governance" className="l-nav-link">
                CoreAI
              </a>
            </li>
<li>
              <a href="#flow" className="l-nav-link">
                How it works
              </a>
            </li>
<li>
              <a href="#personas" className="l-nav-link">
                Workspaces
              </a>
            </li>
<li>
              <a href="#architecture" className="l-nav-link">
                Trust & control
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
            Explore CoreAI demo
          </ButtonLink>
          <ButtonLink
            href={authenticated ? '/' : '/login'}
            variant="primary"
            size="small"
            id="nav-login-link"
          >
            {authenticated ? 'Open workspace' : 'Sign In'}
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
                href="#ai-governance"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                CoreAI
              </a>
            </li>
<li>
              <a
                href="#flow"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                How it works
              </a>
            </li>
<li>
              <a
                href="#personas"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Workspaces
              </a>
            </li>
<li>
              <a
                href="#architecture"
                className="block py-2 text-sm font-semibold text-muted hover:text-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Trust & control
              </a>
            </li>
</ul>
        </div>
      )}
    </header>
  );
}
