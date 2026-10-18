'use client';

import React from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

interface LaunchPath {
  badge: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  icon: IconName;
}

const LAUNCH_PATHS: LaunchPath[] = [
  {
    badge: 'INSTANT SANDBOX',
    title: 'Interactive Role-Switching Demo',
    desc: 'Switch between Executive, Planner, Technician, and Customer views with pre-loaded factory orders.',
    href: '/demo',
    cta: 'Explore demo workspace',
    icon: 'spark',
  },
  {
    badge: 'COMMAND CENTER',
    title: 'Sign In to Operational Workspace',
    desc: 'Manage RFQs, revision-locked BOMs, finite schedules, and double-entry inventory.',
    href: '/login',
    cta: 'Sign In to Workspace',
    icon: 'factory',
  },
  {
    badge: 'BUYER PORTAL',
    title: 'Customer Portal & Passports',
    desc: 'Sign in to view authorized order progress, change requests, and available product passports.',
    href: '/portal/orders',
    cta: 'Open customer portal',
    icon: 'shield',
  },
];

export function LandingCTA() {
  return (
    <section className="l-cta-section" aria-labelledby="cta-heading">
      <div className="l-section-inner">
        <div className="l-cta-card">
          <div className="l-cta-top">
            <span className="l-pill-badge l-anim-float">
              <span className="l-live-pulse-dot blue" aria-hidden="true" />
              <span>ManuOS · Manufacturing Orchestrating System</span>
            </span>

            <h2 id="cta-heading" className="l-cta-title">
              Put CoreAI to work alongside your team.
            </h2>

            <p className="l-cta-desc">
              Explore how connected operations support clearer answers, focused risk reviews, and practical next steps.
            </p>

            <div className="l-cta-buttons">
              <ButtonLink
                href="/demo"
                variant="primary"
                id="cta-demo-button"
                className="flex items-center gap-2 l-btn-glow"
              >
                <span>Explore CoreAI demo</span>
                <Icon name="arrow" className="w-4 h-4" />
              </ButtonLink>
              <ButtonLink
                href="/login"
                variant="default"
                id="cta-signin-button"
              >
                Sign In to Workspace
              </ButtonLink>
            </div>
          </div>

          <div className="l-cta-paths-grid">
            {LAUNCH_PATHS.map((path) => (
              <Link key={path.title} href={path.href} className="l-cta-path-card">
                <div className="l-cta-path-head">
                  <div className="l-cta-path-icon" aria-hidden="true">
                    <Icon name={path.icon} className="w-5 h-5" />
                  </div>
                  <span className="l-cta-path-badge">{path.badge}</span>
                </div>
                <h3 className="l-cta-path-title">{path.title}</h3>
                <p className="l-cta-path-desc">{path.desc}</p>
                <span className="l-cta-path-link">
                  <span>{path.cta}</span>
                  <Icon name="arrow" className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>

          <div className="l-cta-proof-bar">
            <div className="l-cta-proof-item">
              <Icon name="check" className="w-4 h-4 text-emerald-600" />
              <span><strong>Illustrative Demo Workspace</strong></span>
            </div>
            <div className="l-cta-proof-item">
              <Icon name="check" className="w-4 h-4 text-emerald-600" />
              <span><strong>Permission-Aware Views</strong></span>
            </div>
            <div className="l-cta-proof-item">
              <Icon name="check" className="w-4 h-4 text-emerald-600" />
              <span><strong>Connected Operational Records</strong></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
