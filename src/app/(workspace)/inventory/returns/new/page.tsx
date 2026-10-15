import React from 'react';
import { AppShell } from '@/components/app-shell';
import { ReturnMaterialForm } from '@/features/inventory/components/ReturnMaterialForm';
import Link from 'next/link';

export default function NewReturnPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>/</span>
          <span className="text-white">Return Unused Material</span>
        </div>
      }
      activeTitle="Return Unused Material"
    >
      <ReturnMaterialForm />
    </AppShell>
  );
}
