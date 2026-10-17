'use client';

import React from 'react';
import { Icon } from '@/components/icons';
import { ButtonLink } from '@/components/ui/button-link';

export function LandingCTA() {
  return (
    <section className="l-cta-section" aria-labelledby="cta-heading">
      <div className="l-cta-card">
        <h2 id="cta-heading" className="l-cta-title">
          Ready to run custom manufacturing with mathematical certainty?
        </h2>
        <p className="l-cta-desc">
          Experience ManuOS in action with realistic make-to-order scenarios, or sign in to your authoritative manufacturing workspace.
        </p>

        <div className="l-cta-buttons">
          <ButtonLink
            href="/demo"
            variant="primary"
            id="cta-demo-button"
            className="flex items-center gap-2"
          >
            <span>Launch Interactive Demo</span>
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
    </section>
  );
}
