import React from 'react';
import { LandingScrollEffects } from './landing-scroll-effects';
import { LandingNav } from './landing-nav';
import { LandingHero } from './landing-hero';
import { LandingFlow } from './landing-flow';
import { LandingPersonas } from './landing-personas';
import { LandingIntegrity } from './landing-integrity';
import { LandingAI } from './landing-ai';
import { LandingCTA } from './landing-cta';
import { LandingFooter } from './landing-footer';

export interface LandingPageProps {
  /**
   * True when the visitor already holds a signed-in session. Marketing CTAs
   * then point at the workspace ("Open workspace") instead of `/login`, which
   * prevents a Sign In → /welcome → Sign In loop for authenticated visitors
   * who land on the marketing page.
   */
  authenticated?: boolean;
}

export function LandingPage({ authenticated = false }: LandingPageProps = {}) {
  return (
    <div className="landing-container">
      <a href="#main-content" className="landing-skip">
        Skip to main content
      </a>
      <LandingNav authenticated={authenticated} />
      <main id="main-content" className="l-main" tabIndex={-1}>
        <LandingHero authenticated={authenticated} />
        <LandingAI />
        <LandingFlow />
        <LandingPersonas />
        <LandingIntegrity />
        <LandingCTA authenticated={authenticated} />
      </main>
      <LandingFooter authenticated={authenticated} />
      <LandingScrollEffects />
    </div>
  );
}
