import React from 'react';
import { AppShell } from '@/components/app-shell';
import { TransferStockForm } from '@/features/inventory/components/TransferStockForm';
import Link from 'next/link';

export default function NewTransferPage() {
  return (
    <AppShell
      breadcrumb={
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Operations</span>
          <span>/</span>
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>/</span>
          <span className="text-white">Transfer Stock</span>
        </div>
      }
      activeTitle="Transfer Stock"
    >
      <TransferStockForm />
    </AppShell>
  );
}
