import React from 'react';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ManuOS · Manufacturing with CoreAI',
  description: 'Ask operational questions, review delivery risks, and explore recovery options with CoreAI—connected to your manufacturing records.',
};

export default function WelcomePage() {
  return <LandingPage />;
}
