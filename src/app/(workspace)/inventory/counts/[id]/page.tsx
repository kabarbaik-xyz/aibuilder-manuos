'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { StockCountDetailView } from '@/features/inventory/components/StockCountDetailView';
import Link from 'next/link';

export default function StockCountDetailPage() {
  const params = useParams();
  const id = params?.id as string;

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
          <span className="text-white">Count Details</span>
        </div>
      }
      activeTitle="Physical Count Details"
    >
      <StockCountDetailView countId={id} />
    </AppShell>
  );
}
