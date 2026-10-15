import React from 'react';
import { AppShell } from '@/components/app-shell';
import { StockCountListView } from '@/features/inventory/components/StockCountListView';
import Link from 'next/link';

export default function StockCountsPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>/</span>
          <span className="text-white">Physical Counts</span>
        </div>
      }
      activeTitle="Physical Counts"
    >
      <StockCountListView />
    </AppShell>
  );
}
