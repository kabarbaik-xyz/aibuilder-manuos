import React from 'react';
import { LandingNav } from './landing-nav';
import { LandingHero } from './landing-hero';
import { LandingFlow } from './landing-flow';
import { LandingPersonas } from './landing-personas';
import { LandingIntegrity } from './landing-integrity';
import { LandingAI } from './landing-ai';
import { LandingCTA } from './landing-cta';
import { LandingFooter } from './landing-footer';

export function LandingPage() {
  return (
    <div className="landing-container">
      <a href="#main-content" className="landing-skip">
        Skip to main content
      </a>
      <LandingNav />
      <main id="main-content" className="l-main">
        <LandingHero />
        <LandingFlow />
        <LandingPersonas />
        <LandingIntegrity />
        <LandingAI />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
