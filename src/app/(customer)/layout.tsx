import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/server/auth/auth';
import { AuthenticatedShell } from '@/components/authenticated-shell';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePrincipal(await headers());
  // The customer portal requires a server-resolved customer scope. Workspace
  // administrator grants do not confer a customer identity.
  if (!principal.customerId || !principal.permissions.has('customer_order.read_own')) {
    redirect(principal.permissions.has('order.read') ? '/orders' : '/account');
  }
  return <AuthenticatedShell activeTitle="Customer Portal">{children}</AuthenticatedShell>;
}
