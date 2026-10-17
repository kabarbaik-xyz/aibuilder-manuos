import React from 'react';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome to ManuOS · Manufacturing Orchestration System',
  description:
    'Overview of ManuOS capabilities, architecture invariants, role experiences, and operational continuum.',
};

export default function WelcomePage() {
  return <LandingPage />;
}
