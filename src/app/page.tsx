import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/server/auth/auth';
import { getLandingPage } from '@/lib/persona-navigation';
import { LandingPage } from '@/components/marketing/landing-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ManuOS · Manufacturing with CoreAI',
  description: 'Ask operational questions, review delivery risks, and explore recovery options with CoreAI—connected to your manufacturing records.',
};

export default async function Home() {
  try {
    const principal = await requirePrincipal(await headers());
    const permissions = [...principal.permissions];
    const roles = principal.roles ?? [];
    const destination = getLandingPage(
      permissions,
      roles,
      principal.customerId,
      principal.landingPage
    );
    redirect(destination);
  } catch (err: unknown) {
    // If the error is a Next.js redirect, rethrow it so navigation happens
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest?: unknown }).digest === 'string' &&
      ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
        (err as { digest: string }).digest.startsWith('NEXT_NOT_FOUND'))
    ) {
      throw err;
    }
    // Unauthenticated visitor -> render authoritative Landing Page
    return <LandingPage />;
  }
}
