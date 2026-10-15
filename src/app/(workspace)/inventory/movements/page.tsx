import React from 'react';
import { AppShell } from '@/components/app-shell';
import { StockMovementsView } from '@/features/inventory/components/StockMovementsView';

export default function StockMovementsPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <span>Inventory</span>
          <span>/</span>
          <span className="text-white">Stock Card Movements</span>
        </div>
      }
      activeTitle="Stock Card Movements"
    >
      <StockMovementsView />
    </AppShell>
  );
}
