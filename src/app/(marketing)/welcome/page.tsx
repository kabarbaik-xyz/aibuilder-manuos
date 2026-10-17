import React from 'react';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome to ManuOS · Manufacturing Orchestrating System',
  description:
    'Overview of ManuOS capabilities, operational guarantees, role cockpits, and end-to-end manufacturing orchestration.',
};

export default function WelcomePage() {
  return <LandingPage />;
}
