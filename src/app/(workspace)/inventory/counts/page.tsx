import React from 'react';
import { StockCountListView } from '@/features/inventory/components/StockCountListView';
import Link from 'next/link';

export default function StockCountsPage() {
  return (
    <div className="page-stack">
      <StockCountListView />
    </div>
  );
}
