import React from 'react';
import { AuthenticatedShell } from '@/components/authenticated-shell';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell activeTitle="Account & Settings">{children}</AuthenticatedShell>;
}
