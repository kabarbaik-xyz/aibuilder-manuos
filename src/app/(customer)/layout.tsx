import React from 'react';
import { AuthenticatedShell } from '@/components/authenticated-shell';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell activeTitle="Customer Portal">{children}</AuthenticatedShell>;
}
