import React from 'react';
import { StockCountForm } from '@/features/inventory/components/StockCountForm';
import Link from 'next/link';

export default function NewStockCountPage() {
  return (
    <div className="page-stack">
      <StockCountForm />
    </div>
  );
}
