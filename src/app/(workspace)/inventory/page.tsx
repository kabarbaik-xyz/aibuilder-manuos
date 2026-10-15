import React from 'react';
import { AppShell } from '@/components/app-shell';
import { StockBalancesView } from '@/features/inventory/components/StockBalancesView';

export default function InventoryPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <span className="text-white">Inventory & Balances</span>
        </div>
      }
      activeTitle="Inventory & Balances"
    >
      <StockBalancesView />
    </AppShell>
  );
}
