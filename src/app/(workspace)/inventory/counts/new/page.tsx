import React from 'react';
import { AppShell } from '@/components/app-shell';
import { StockCountForm } from '@/features/inventory/components/StockCountForm';
import Link from 'next/link';

export default function NewStockCountPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>/</span>
          <Link href="/inventory/counts" className="hover:underline">Physical Counts</Link>
          <span>/</span>
          <span className="text-white">Record Count</span>
        </div>
      }
      activeTitle="Record Physical Count"
    >
      <StockCountForm />
    </AppShell>
  );
}
