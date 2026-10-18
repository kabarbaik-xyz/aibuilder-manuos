import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { redirectIfAuthenticated } from '@/server/auth/landing';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ManuOS · Manufacturing with CoreAI',
  description: 'Ask operational questions, review delivery risks, and explore recovery options with CoreAI—connected to your manufacturing records.',
};

export default async function WelcomePage() {
  // Authenticated visitors must reach their persona workspace; the marketing
  // page is only for signed-out visitors (see resolveLanding docs).
  const { authenticated } = await redirectIfAuthenticated(await headers());
  return <LandingPage authenticated={authenticated} />;
}
