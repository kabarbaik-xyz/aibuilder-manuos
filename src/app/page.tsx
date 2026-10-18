import React from 'react';
import { headers } from 'next/headers';
import { redirectIfAuthenticated } from '@/server/auth/landing';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ManuOS · Manufacturing Orchestrating System',
  description:
    'Coordinates custom make-to-order manufacturing through connected orders, DAG workflows, double-entry inventory ledgers, shop floor execution, and digital product passports.',
};

export default async function Home() {
  // Authenticated visitors are redirected to their persona workspace; everyone
  // else sees the authoritative marketing Landing Page.
  const { authenticated } = await redirectIfAuthenticated(await headers());
  return <LandingPage authenticated={authenticated} />;
}
