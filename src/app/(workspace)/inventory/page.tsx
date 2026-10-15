import React from 'react';
import { StockBalancesView } from '@/features/inventory/components/StockBalancesView';

export default function InventoryPage() {
  return (
    <div className="page-stack">
      <StockBalancesView />
    </div>
  );
}
