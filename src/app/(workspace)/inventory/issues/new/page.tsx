import React from 'react';
import { AppShell } from '@/components/app-shell';
import { IssueMaterialForm } from '@/features/inventory/components/IssueMaterialForm';
import Link from 'next/link';

export default function NewIssuePage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>/</span>
          <span className="text-white">Issue to WIP</span>
        </div>
      }
      activeTitle="Issue Material to WIP"
    >
      <IssueMaterialForm />
    </AppShell>
  );
}
