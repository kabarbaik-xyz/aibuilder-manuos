import React from 'react';
import { AuthenticatedShell } from '@/components/authenticated-shell';

export default function EvidenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell activeTitle="Traceability & Evidence">{children}</AuthenticatedShell>;
}
